import type Stripe from "stripe";
import { z } from "zod";
import { isDefinitiveStripeSessionCreationFailure } from "@/lib/checkout/create-hosted-checkout";
import type { AllowedShippingCountry } from "@/lib/checkout/shipping";
import type { JsonRecord } from "@/lib/db/schema";
import type { DestinationProvince } from "@/lib/orders/destination-province";

export const shippingPaymentRequestLifetimeMs = 24 * 60 * 60 * 1_000 - 60 * 1_000;

export const shippingPaymentMetadataSchema = z
  .object({
    checkoutKind: z.literal("order_shipping_payment"),
    shippingPaymentRequestId: z.string().uuid(),
    shippingPaymentGeneration: z.coerce.number().int().positive(),
  })
  .strict();

export type PreparedShippingPayment = {
  requestId: string;
  generation: number;
  stripeCreateIdempotencyKey: string;
  stripeSessionParams: JsonRecord;
  checkoutUrl: string | null;
};

export type DeliveryReviewRepository = {
  approveDeliveryAddress: (
    orderId: string,
  ) => Promise<"approved" | "already_approved" | "not_found" | "invalid_status">;
  prepareShippingPayment: (
    orderId: string,
    settings: ShippingPaymentSettings,
    now: Date,
  ) => Promise<PreparedShippingPayment>;
  linkShippingPaymentSession: (
    request: Pick<PreparedShippingPayment, "requestId" | "generation">,
    session: { id: string; url: string },
    linkedAt: Date,
  ) => Promise<{ checkoutUrl: string; emailQueued: boolean }>;
  markShippingPaymentCreationFailed: (
    request: Pick<PreparedShippingPayment, "requestId" | "generation">,
    failedAt: Date,
  ) => Promise<void>;
};

export type ShippingPaymentSessionClient = {
  create: (
    params: Stripe.Checkout.SessionCreateParams,
    options: { idempotencyKey: string },
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
};

export type ShippingPaymentSettings = {
  appUrl: string;
  allowedCountries: AllowedShippingCountry[];
  taxEnabled: boolean;
};

export type PaidShippingPaymentData = {
  requestId: string;
  generation: number;
  stripeSessionId: string;
  stripePaymentIntentId: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: Record<string, unknown>;
  destinationProvince: DestinationProvince | null;
};

export type ShippingPaymentEventReference = {
  requestId: string;
  generation: number;
  stripeSessionId: string;
};

export type ShippingPaymentEventResult = {
  changed: boolean;
  orderId: string | null;
};

export type ShippingPaymentEventWriter = {
  recordPaidShippingPayment: (
    payment: PaidShippingPaymentData,
  ) => Promise<ShippingPaymentEventResult>;
  closeShippingPayment: (
    reference: ShippingPaymentEventReference,
    reason: "expired" | "async_payment_failed",
  ) => Promise<ShippingPaymentEventResult>;
};

type RequestShippingPaymentDependencies = {
  repository: DeliveryReviewRepository;
  sessions: ShippingPaymentSessionClient;
  now?: () => Date;
  isDefinitiveSessionCreationFailure?: (error: unknown) => boolean;
};

export class DeliveryReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeliveryReviewError";
  }
}

/** Creates or resumes the single current Checkout Session for an order's shipping charge. */
export async function requestOrderShippingPayment(
  orderId: string,
  settings: ShippingPaymentSettings,
  dependencies: RequestShippingPaymentDependencies,
): Promise<{ checkoutUrl: string; emailQueued: boolean }> {
  const prepared = await dependencies.repository.prepareShippingPayment(
    orderId,
    settings,
    dependencies.now?.() ?? new Date(),
  );

  if (prepared.checkoutUrl) {
    return { checkoutUrl: prepared.checkoutUrl, emailQueued: false };
  }

  const params = parseShippingPaymentSessionParams(prepared.stripeSessionParams, prepared);
  let session: Awaited<ReturnType<ShippingPaymentSessionClient["create"]>>;

  try {
    session = await dependencies.sessions.create(params, {
      idempotencyKey: prepared.stripeCreateIdempotencyKey,
    });
  } catch (error) {
    const isDefinitiveFailure =
      dependencies.isDefinitiveSessionCreationFailure?.(error) ??
      isDefinitiveStripeSessionCreationFailure(error);

    if (isDefinitiveFailure) {
      await dependencies.repository.markShippingPaymentCreationFailed(
        prepared,
        dependencies.now?.() ?? new Date(),
      );
    }

    throw error;
  }

  if (!session.url) {
    throw new DeliveryReviewError("Stripe did not return a shipping-payment URL.");
  }

  return dependencies.repository.linkShippingPaymentSession(
    prepared,
    { id: session.id, url: session.url },
    dependencies.now?.() ?? new Date(),
  );
}

type BuildShippingPaymentSessionParamsInput = {
  requestId: string;
  generation: number;
  orderNumber: string;
  customerEmail: string;
  amountCents: number;
  currency: string;
  expiresAt: Date;
};

/** Builds the exact Stripe request persisted before the external API call. */
export function buildShippingPaymentSessionParams(
  input: BuildShippingPaymentSessionParamsInput,
  settings: ShippingPaymentSettings,
): Stripe.Checkout.SessionCreateParams {
  if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DeliveryReviewError("A positive shipping rate is required for this order.");
  }

  const appUrl = settings.appUrl.replace(/\/$/, "");

  return {
    mode: "payment",
    payment_method_types: ["card"],
    client_reference_id: input.requestId,
    customer_email: input.customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountCents,
          tax_behavior: "exclusive",
          product_data: {
            name: `Shipping for order ${input.orderNumber}`,
            tax_code: "txcd_92010001",
          },
        },
      },
    ],
    automatic_tax: { enabled: settings.taxEnabled },
    shipping_address_collection: { allowed_countries: settings.allowedCountries },
    allow_promotion_codes: false,
    success_url: `${appUrl}/order/shipping-payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/order/shipping-payment/cancelled`,
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    after_expiration: { recovery: { enabled: false } },
    metadata: {
      checkoutKind: "order_shipping_payment",
      shippingPaymentRequestId: input.requestId,
      shippingPaymentGeneration: input.generation.toString(),
    },
  };
}

const persistedShippingPaymentSessionParamsSchema = z
  .object({
    mode: z.literal("payment"),
    client_reference_id: z.string().uuid(),
    expires_at: z.number().int().positive(),
    line_items: z.array(z.unknown()).length(1),
    metadata: shippingPaymentMetadataSchema,
  })
  .passthrough();

export function parseShippingPaymentSessionParams(
  input: unknown,
  request: Pick<PreparedShippingPayment, "requestId" | "generation">,
): Stripe.Checkout.SessionCreateParams {
  const parsed = persistedShippingPaymentSessionParamsSchema.safeParse(input);

  if (
    !parsed.success ||
    parsed.data.client_reference_id !== request.requestId ||
    parsed.data.metadata.shippingPaymentRequestId !== request.requestId ||
    parsed.data.metadata.shippingPaymentGeneration !== request.generation
  ) {
    throw new DeliveryReviewError("Persisted shipping-payment request is invalid.");
  }

  return parsed.data as unknown as Stripe.Checkout.SessionCreateParams;
}
