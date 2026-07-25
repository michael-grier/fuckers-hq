import type Stripe from "stripe";
import { z } from "zod";

import {
  buildStripeLineItemsFromSnapshots,
  getCheckoutSnapshotSubtotalCents,
} from "@/lib/checkout/items";
import { type AllowedShippingCountry, buildShippingOptions } from "@/lib/checkout/shipping";
import type { JsonRecord, PendingCheckoutLineSnapshot } from "@/lib/db/schema";
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
  lineItems: PendingCheckoutLineSnapshot[];
};

export type CheckoutRepository = {
  reserveCheckout: (checkout: {
    requestId: string;
    pendingCheckoutToken: string;
    reservationToken: string;
    items: CartLine[];
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
  freeShippingThresholdCents: number;
  taxEnabled: boolean;
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
  const { items, requestId } = checkoutSchema.parse(input);
  const now = dependencies.now?.() ?? new Date();
  const reservation = await dependencies.repository.reserveCheckout({
    requestId,
    pendingCheckoutToken: dependencies.createToken(),
    reservationToken: dependencies.createToken(),
    items,
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
    "pendingCheckoutToken" | "reservationToken" | "expiresAt" | "lineItems"
  >,
  settings: HostedCheckoutSettings,
): Stripe.Checkout.SessionCreateParams {
  const appUrl = settings.appUrl.replace(/\/$/, "");

  return {
    mode: "payment",
    client_reference_id: reservation.reservationToken,
    line_items: buildStripeLineItemsFromSnapshots(reservation.lineItems),
    automatic_tax: { enabled: settings.taxEnabled },
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
  reservation: Pick<CheckoutReservation, "pendingCheckoutToken" | "reservationToken" | "expiresAt">,
): Stripe.Checkout.SessionCreateParams {
  const parsed = persistedStripeSessionParamsSchema.safeParse(input);

  if (
    !parsed.success ||
    parsed.data.client_reference_id !== reservation.reservationToken ||
    parsed.data.metadata.pendingCheckoutToken !== reservation.pendingCheckoutToken ||
    parsed.data.metadata.reservationToken !== reservation.reservationToken ||
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
