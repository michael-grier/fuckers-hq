import type Stripe from "stripe";
import { z } from "zod";

import {
  buildStripeLineItemsFromSnapshots,
  getCheckoutSnapshotSubtotalCents,
} from "@/lib/checkout/items";
import { formatPickupAddressInline, type PickupLocation } from "@/lib/checkout/pickup";
import { type AllowedShippingCountry, buildShippingOptions } from "@/lib/checkout/shipping";
import type { FulfillmentMethod, JsonRecord, PendingCheckoutLineSnapshot } from "@/lib/db/schema";
import type { CartLine } from "@/lib/validators/cart";
import { checkoutSchema, pendingCheckoutMetadataSchema } from "@/lib/validators/cart";

import { CheckoutError } from "./errors";

const pendingCheckoutLifetimeMs = 60 * 60 * 1000;
const provisioningReconcileDelayMs = 5 * 60 * 1000;

export type CheckoutReservation = {
  pendingCheckoutToken: string;
  reservationToken: string;
  stripeCreateIdempotencyKey: string;
  stripeSessionId: string | null;
  stripeSessionParams: JsonRecord | null;
  expiresAt: Date;
  fulfillmentMethod: FulfillmentMethod;
  lineItems: PendingCheckoutLineSnapshot[];
};

export type CheckoutRepository = {
  reserveCheckout: (checkout: {
    requestId: string;
    pendingCheckoutToken: string;
    reservationToken: string;
    items: CartLine[];
    fulfillmentMethod: FulfillmentMethod;
    expiresAt: Date;
    nextReconcileAt: Date;
  }) => Promise<CheckoutReservation>;
  prepareStripeSession: (
    reservationToken: string,
    params: Stripe.Checkout.SessionCreateParams,
  ) => Promise<Stripe.Checkout.SessionCreateParams>;
  linkStripeSession: (reservationToken: string, stripeSessionId: string) => Promise<void>;
  releaseSessionCreationFailure: (reservationToken: string, releasedAt: Date) => Promise<boolean>;
};

export type CheckoutSessionClient = {
  create: (
    params: Stripe.Checkout.SessionCreateParams,
    options: { idempotencyKey: string },
  ) => Promise<Pick<Stripe.Checkout.Session, "id" | "url">>;
};

export type HostedCheckoutSettings = {
  appUrl: string;
  allowedCountries: AllowedShippingCountry[];
  standardShippingRateCents: number;
  /** Omitted when the store charges a flat rate with no free-shipping tier. */
  freeShippingThresholdCents?: number;
  taxEnabled: boolean;
  pickupLocation: PickupLocation | null;
};

type HostedCheckoutDependencies = {
  repository: CheckoutRepository;
  sessions: CheckoutSessionClient;
  createToken: () => string;
  now?: () => Date;
  isDefinitiveSessionCreationFailure?: (error: unknown) => boolean;
};

export async function createHostedCheckout(
  input: unknown,
  settings: HostedCheckoutSettings,
  dependencies: HostedCheckoutDependencies,
): Promise<{ url: string }> {
  const { items, requestId, fulfillmentMethod } = checkoutSchema.parse(input);

  // Availability is decided here, on the server, so a crafted request cannot select pickup while
  // it is turned off and skip both the shipping address and the shipping charge.
  if (fulfillmentMethod === "pickup" && !settings.pickupLocation) {
    throw new CheckoutError("Local pickup is not available.", 400);
  }

  const now = dependencies.now?.() ?? new Date();
  const reservation = await dependencies.repository.reserveCheckout({
    requestId,
    pendingCheckoutToken: dependencies.createToken(),
    reservationToken: dependencies.createToken(),
    items,
    fulfillmentMethod,
    expiresAt: new Date(now.getTime() + pendingCheckoutLifetimeMs),
    nextReconcileAt: new Date(now.getTime() + provisioningReconcileDelayMs),
  });
  const proposedParams = buildStripeSessionParams(reservation, settings);
  const sessionParams = await dependencies.repository.prepareStripeSession(
    reservation.reservationToken,
    proposedParams,
  );
  let session: Awaited<ReturnType<CheckoutSessionClient["create"]>>;

  try {
    session = await dependencies.sessions.create(sessionParams, {
      idempotencyKey: reservation.stripeCreateIdempotencyKey,
    });
  } catch (error) {
    const isDefinitiveFailure =
      dependencies.isDefinitiveSessionCreationFailure?.(error) ??
      isDefinitiveStripeSessionCreationFailure(error);

    if (isDefinitiveFailure) {
      await dependencies.repository.releaseSessionCreationFailure(
        reservation.reservationToken,
        dependencies.now?.() ?? new Date(),
      );
    }

    throw error;
  }

  await dependencies.repository.linkStripeSession(reservation.reservationToken, session.id);

  if (!session.url) {
    throw new CheckoutError("Stripe did not return a hosted Checkout URL.", 500);
  }

  return { url: session.url };
}

export function buildStripeSessionParams(
  reservation: Pick<
    CheckoutReservation,
    "pendingCheckoutToken" | "reservationToken" | "expiresAt" | "lineItems" | "fulfillmentMethod"
  >,
  settings: HostedCheckoutSettings,
): Stripe.Checkout.SessionCreateParams {
  const appUrl = settings.appUrl.replace(/\/$/, "");
  const isPickup = reservation.fulfillmentMethod === "pickup";

  return {
    mode: "payment",
    // Pinning the list opts out of Stripe's dynamic payment methods, so pay-later options such as
    // Affirm and Klarna cannot reach checkout from a Dashboard toggle. "card" still covers the
    // Apple Pay and Google Pay wallets.
    payment_method_types: ["card"],
    client_reference_id: reservation.reservationToken,
    line_items: buildStripeLineItemsFromSnapshots(reservation.lineItems),
    automatic_tax: { enabled: settings.taxEnabled },
    // Pickup collects no address and offers no shipping rate, so Stripe charges no shipping and
    // reports none back on the paid Session.
    ...(isPickup
      ? {
          // Automatic tax needs a customer location, and pickup collects no shipping address.
          billing_address_collection: "required" as const,
        }
      : {
          shipping_address_collection: {
            allowed_countries: settings.allowedCountries,
          },
          shipping_options: buildShippingOptions(
            getCheckoutSnapshotSubtotalCents(reservation.lineItems),
            {
              standardRateCents: settings.standardShippingRateCents,
              freeThresholdCents: settings.freeShippingThresholdCents,
            },
          ),
        }),
    ...(isPickup && settings.pickupLocation
      ? {
          custom_text: {
            submit: {
              message: `Pick up at ${settings.pickupLocation.name}, ${formatPickupAddressInline(settings.pickupLocation)}. We'll email you when your order is ready.`,
            },
          },
        }
      : {}),
    success_url: `${appUrl}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/cart`,
    expires_at: Math.floor(reservation.expiresAt.getTime() / 1000),
    after_expiration: {
      recovery: {
        enabled: false,
      },
    },
    metadata: {
      pendingCheckoutToken: reservation.pendingCheckoutToken,
      reservationToken: reservation.reservationToken,
      fulfillmentMethod: reservation.fulfillmentMethod,
    },
  };
}

const persistedStripeSessionParamsSchema = z
  .object({
    mode: z.literal("payment"),
    client_reference_id: z.string().min(1),
    expires_at: z.number().int().positive(),
    line_items: z.array(z.unknown()).min(1),
    metadata: pendingCheckoutMetadataSchema,
  })
  .passthrough();

export function parsePersistedStripeSessionParams(
  input: unknown,
  reservation: Pick<
    CheckoutReservation,
    "pendingCheckoutToken" | "reservationToken" | "expiresAt" | "fulfillmentMethod"
  >,
): Stripe.Checkout.SessionCreateParams {
  const parsed = persistedStripeSessionParamsSchema.safeParse(input);

  if (
    !parsed.success ||
    parsed.data.client_reference_id !== reservation.reservationToken ||
    parsed.data.metadata.pendingCheckoutToken !== reservation.pendingCheckoutToken ||
    parsed.data.metadata.reservationToken !== reservation.reservationToken ||
    // Sessions persisted before local pickup existed carry no method and are always shipping.
    (parsed.data.metadata.fulfillmentMethod ?? "shipping") !== reservation.fulfillmentMethod ||
    parsed.data.expires_at !== Math.floor(reservation.expiresAt.getTime() / 1000)
  ) {
    throw new CheckoutError("Persisted Stripe Session request is invalid.", 500);
  }

  return parsed.data as unknown as Stripe.Checkout.SessionCreateParams;
}

export function isDefinitiveStripeSessionCreationFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("type" in error)) {
    return false;
  }

  return (
    error.type === "StripeInvalidRequestError" ||
    error.type === "StripeAuthenticationError" ||
    error.type === "StripePermissionError"
  );
}

export function isCheckoutValidationError(error: unknown): error is z.ZodError {
  return error instanceof z.ZodError;
}
