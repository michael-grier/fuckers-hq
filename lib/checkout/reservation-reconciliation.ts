import type Stripe from "stripe";

import {
  isDefinitiveStripeSessionCreationFailure,
  parsePersistedStripeSessionParams,
} from "@/lib/checkout/create-hosted-checkout";
import type { FulfillmentMethod, JsonRecord } from "@/lib/db/schema";

export const INVENTORY_RECONCILIATION_BATCH_SIZE = 20;
export const INVENTORY_RECONCILIATION_LEASE_MS = 10 * 60 * 1000;
const INVENTORY_RECONCILIATION_RETRY_MS = 5 * 60 * 1000;
const STRIPE_IDEMPOTENCY_RETENTION_MINIMUM_MS = 24 * 60 * 60 * 1000;

export type ReservationReconciliationClaim = {
  id: string;
  token: string;
  pendingCheckoutToken: string;
  stripeCreateIdempotencyKey: string;
  stripeSessionId: string | null;
  stripeSessionParams: JsonRecord | null;
  status: "provisioning" | "active" | "awaiting_payment";
  expiresAt: Date;
  createdAt: Date;
  attemptCount: number;
  fulfillmentMethod: FulfillmentMethod;
};

export type ReservationReconciliationRepository = {
  findDueReservationTokens: (now: Date, limit: number) => Promise<string[]>;
  claimReservation: (
    token: string,
    now: Date,
    leaseUntil: Date,
  ) => Promise<ReservationReconciliationClaim | null>;
  linkStripeSession: (reservationToken: string, stripeSessionId: string) => Promise<void>;
  markAwaitingPayment: (
    claim: ReservationReconciliationClaim,
    stripeSessionId: string,
    nextReconcileAt: Date,
  ) => Promise<boolean>;
  releaseReservation: (
    claim: ReservationReconciliationClaim,
    stripeSessionId: string | null,
    reason: string,
    releasedAt: Date,
  ) => Promise<boolean>;
  deferReservation: (
    claim: ReservationReconciliationClaim,
    nextReconcileAt: Date,
    errorCode: string | null,
  ) => Promise<boolean>;
};

export type ReconciliationSessionClient = {
  create: (
    params: Stripe.Checkout.SessionCreateParams,
    options: { idempotencyKey: string },
  ) => Promise<Stripe.Checkout.Session>;
  retrieve: (
    stripeSessionId: string,
    params: { expand: ["payment_intent"] },
  ) => Promise<Stripe.Checkout.Session>;
};

type ReconcileDependencies = {
  repository: ReservationReconciliationRepository;
  sessions: ReconciliationSessionClient;
  handlePaidSession: (session: Stripe.Checkout.Session) => Promise<void>;
  reportError: (error: unknown) => void;
};

export type ReconcileInventoryReservationsResult = {
  attempted: number;
  converted: number;
  released: number;
  deferred: number;
  failed: number;
};

export async function reconcileInventoryReservations(
  dependencies: ReconcileDependencies,
  options: {
    now?: Date;
    limit?: number;
  } = {},
): Promise<ReconcileInventoryReservationsResult> {
  const now = options.now ?? new Date();
  const limit = Math.min(
    Math.max(options.limit ?? INVENTORY_RECONCILIATION_BATCH_SIZE, 1),
    INVENTORY_RECONCILIATION_BATCH_SIZE,
  );
  const tokens = await dependencies.repository.findDueReservationTokens(now, limit);
  const result: ReconcileInventoryReservationsResult = {
    attempted: 0,
    converted: 0,
    released: 0,
    deferred: 0,
    failed: 0,
  };

  for (const token of tokens) {
    let claim: ReservationReconciliationClaim | null;

    try {
      claim = await dependencies.repository.claimReservation(
        token,
        now,
        new Date(now.getTime() + INVENTORY_RECONCILIATION_LEASE_MS),
      );
    } catch (error) {
      dependencies.reportError(normalizeReconciliationError(error));
      result.failed += 1;
      continue;
    }

    if (!claim) {
      continue;
    }

    result.attempted += 1;

    try {
      const session = await recoverStripeSession(claim, dependencies, now);

      if (!session) {
        result.released += 1;
        continue;
      }

      if (session.id !== claim.stripeSessionId) {
        await dependencies.repository.linkStripeSession(claim.token, session.id);
      }

      if (session.payment_status === "paid" || session.payment_status === "no_payment_required") {
        await dependencies.handlePaidSession(session);
        result.converted += 1;
        continue;
      }

      if (session.status === "expired") {
        const released = await dependencies.repository.releaseReservation(
          claim,
          session.id,
          "reconciled_stripe_expired",
          now,
        );
        result.released += Number(released);
        continue;
      }

      const nextReconcileAt = new Date(now.getTime() + INVENTORY_RECONCILIATION_RETRY_MS);

      if (session.status === "complete") {
        if (isConfirmedAsyncPaymentFailure(session)) {
          const released = await dependencies.repository.releaseReservation(
            claim,
            session.id,
            "reconciled_async_payment_failed",
            now,
          );
          result.released += Number(released);
        } else {
          await dependencies.repository.markAwaitingPayment(claim, session.id, nextReconcileAt);
          result.deferred += 1;
        }
      } else {
        await dependencies.repository.deferReservation(claim, nextReconcileAt, null);
        result.deferred += 1;
      }
    } catch (error) {
      dependencies.reportError(normalizeReconciliationError(error));

      try {
        // A broken retry write must not prevent unrelated claims in this bounded batch.
        await dependencies.repository.deferReservation(
          claim,
          new Date(now.getTime() + INVENTORY_RECONCILIATION_RETRY_MS),
          getReconciliationErrorCode(error),
        );
      } catch (deferError) {
        dependencies.reportError(normalizeReconciliationError(deferError));
      }

      result.failed += 1;
    }
  }

  return result;
}

async function recoverStripeSession(
  claim: ReservationReconciliationClaim,
  dependencies: ReconcileDependencies,
  now: Date,
): Promise<Stripe.Checkout.Session | null> {
  if (claim.stripeSessionId) {
    return dependencies.sessions.retrieve(claim.stripeSessionId, {
      expand: ["payment_intent"],
    });
  }

  if (!claim.stripeSessionParams) {
    await dependencies.repository.releaseReservation(
      claim,
      null,
      "abandoned_before_stripe_request",
      now,
    );
    return null;
  }

  const params = parsePersistedStripeSessionParams(claim.stripeSessionParams, {
    pendingCheckoutToken: claim.pendingCheckoutToken,
    reservationToken: claim.token,
    expiresAt: claim.expiresAt,
    fulfillmentMethod: claim.fulfillmentMethod,
  });

  try {
    return await dependencies.sessions.create(params, {
      idempotencyKey: claim.stripeCreateIdempotencyKey,
    });
  } catch (error) {
    // After 24 hours Stripe may prune the key, so a new rejection cannot disprove an older Session.
    if (
      isDefinitiveStripeSessionCreationFailure(error) &&
      now.getTime() - claim.createdAt.getTime() < STRIPE_IDEMPOTENCY_RETENTION_MINIMUM_MS
    ) {
      await dependencies.repository.releaseReservation(
        claim,
        null,
        "stripe_session_creation_failed",
        now,
      );
      return null;
    }

    throw error;
  }
}

function isConfirmedAsyncPaymentFailure(session: Stripe.Checkout.Session): boolean {
  const paymentIntent = session.payment_intent;

  return (
    typeof paymentIntent === "object" &&
    paymentIntent !== null &&
    "status" in paymentIntent &&
    (paymentIntent.status === "canceled" || paymentIntent.status === "requires_payment_method")
  );
}

function getReconciliationErrorCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    typeof error.type === "string" &&
    error.type.startsWith("Stripe")
  ) {
    return "stripe_request_error";
  }

  return "reconciliation_error";
}

function normalizeReconciliationError(error: unknown): Error {
  return new Error(getReconciliationErrorCode(error), {
    cause: error instanceof Error ? error.name : undefined,
  });
}
