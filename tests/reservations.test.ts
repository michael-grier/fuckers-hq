import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";

import { buildStripeSessionParams } from "@/lib/checkout/create-hosted-checkout";
import {
  type ReservationReconciliationClaim,
  type ReservationReconciliationRepository,
  reconcileInventoryReservations,
} from "@/lib/checkout/reservation-reconciliation";
import type { JsonRecord } from "@/lib/db/schema";
import { inventoryReservationStatusSchema } from "@/lib/validators/inventory-reservation";

const now = new Date("2026-07-10T13:05:00.000Z");
const expiresAt = new Date("2026-07-10T13:00:00.000Z");
const pendingCheckoutToken = "checkout_abcDEF123456789";
const reservationToken = "reservation_abcDEF123456";
const stripeSessionId = "cs_test_reservation";
const sessionParams = buildStripeSessionParams(
  {
    pendingCheckoutToken,
    reservationToken,
    expiresAt,
    lineItems: [
      {
        variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
        productName: "Database Deck",
        variantName: '8.25"',
        unitPriceCents: 8900,
        quantity: 1,
        currency: "cad",
      },
    ],
  },
  {
    appUrl: "http://localhost:3000",
    allowedCountries: ["CA"],
    standardShippingRateCents: 1500,
    freeShippingThresholdCents: 10000,
    taxEnabled: true,
  },
) as unknown as JsonRecord;

function makeClaim(
  overrides: Partial<ReservationReconciliationClaim> = {},
): ReservationReconciliationClaim {
  return {
    id: "4bc9866f-c2c5-4a90-b80c-775f4333445a",
    token: reservationToken,
    pendingCheckoutToken,
    stripeCreateIdempotencyKey: `checkout-session/${reservationToken}`,
    stripeSessionId: null,
    stripeSessionParams: sessionParams,
    status: "provisioning",
    expiresAt,
    createdAt: new Date("2026-07-10T12:00:00.000Z"),
    attemptCount: 1,
    ...overrides,
  };
}

function makeStripeSession(
  status: "open" | "complete" | "expired",
  paymentStatus: "paid" | "unpaid" | "no_payment_required",
  paymentIntentStatus?: "canceled" | "processing" | "requires_payment_method",
): Stripe.Checkout.Session {
  return {
    id: stripeSessionId,
    status,
    payment_status: paymentStatus,
    payment_intent: paymentIntentStatus
      ? {
          id: "pi_test_reservation",
          status: paymentIntentStatus,
        }
      : null,
  } as unknown as Stripe.Checkout.Session;
}

function makeRepository(
  claim: ReservationReconciliationClaim,
  transitions: string[],
): ReservationReconciliationRepository {
  return {
    findDueReservationTokens: async (_now, limit) => {
      expect(limit).toBe(20);
      return [claim.token];
    },
    claimReservation: async () => claim,
    linkStripeSession: async (_token, sessionId) => {
      transitions.push(`linked:${sessionId}`);
    },
    markAwaitingPayment: async (_claim, sessionId) => {
      transitions.push(`awaiting:${sessionId}`);
      return true;
    },
    releaseReservation: async (_claim, sessionId, reason) => {
      transitions.push(`released:${sessionId ?? "none"}:${reason}`);
      return true;
    },
    deferReservation: async (_claim, _next, errorCode) => {
      transitions.push(`deferred:${errorCode ?? "none"}`);
      return true;
    },
  };
}

describe("reservation state contract", () => {
  test("accepts only explicit reservation states", () => {
    for (const status of [
      "provisioning",
      "active",
      "awaiting_payment",
      "converted",
      "released",
    ] as const) {
      expect(inventoryReservationStatusSchema.parse(status)).toBe(status);
    }

    expect(() => inventoryReservationStatusSchema.parse("expired")).toThrow();
  });
});

describe("reservation reconciliation", () => {
  test("recovers stale provisioning with the persisted Stripe request and idempotency key", async () => {
    const transitions: string[] = [];
    const paidSessions: string[] = [];
    const idempotencyKeys: string[] = [];
    const claim = makeClaim();

    const result = await reconcileInventoryReservations(
      {
        repository: makeRepository(claim, transitions),
        sessions: {
          create: async (_params, options) => {
            idempotencyKeys.push(options.idempotencyKey);
            return makeStripeSession("complete", "paid");
          },
          retrieve: async () => {
            throw new Error("Unexpected retrieve.");
          },
        },
        handlePaidSession: async (session) => {
          paidSessions.push(session.id);
        },
        reportError: () => {},
      },
      { now },
    );

    expect(result).toEqual({
      attempted: 1,
      converted: 1,
      released: 0,
      deferred: 0,
      failed: 0,
    });
    expect(idempotencyKeys).toEqual([`checkout-session/${reservationToken}`]);
    expect(transitions).toEqual([`linked:${stripeSessionId}`]);
    expect(paidSessions).toEqual([stripeSessionId]);
  });

  test("releases provisioning that never reached the persisted Stripe request boundary", async () => {
    const transitions: string[] = [];
    const claim = makeClaim({ stripeSessionParams: null });

    const result = await reconcileInventoryReservations(
      {
        repository: makeRepository(claim, transitions),
        sessions: {
          create: async () => {
            throw new Error("Unexpected create.");
          },
          retrieve: async () => {
            throw new Error("Unexpected retrieve.");
          },
        },
        handlePaidSession: async () => {},
        reportError: () => {},
      },
      { now },
    );

    expect(result.released).toBe(1);
    expect(transitions).toEqual(["released:none:abandoned_before_stripe_request"]);
  });

  test("never releases from the local clock when Stripe still reports an open Session", async () => {
    const transitions: string[] = [];
    const claim = makeClaim({
      status: "active",
      stripeSessionId,
    });

    const result = await reconcileInventoryReservations(
      {
        repository: makeRepository(claim, transitions),
        sessions: {
          create: async () => {
            throw new Error("Unexpected create.");
          },
          retrieve: async () => makeStripeSession("open", "unpaid"),
        },
        handlePaidSession: async () => {},
        reportError: () => {},
      },
      { now },
    );

    expect(result.deferred).toBe(1);
    expect(result.released).toBe(0);
    expect(transitions).toEqual(["deferred:none"]);
  });

  test("releases Stripe-confirmed expiration or payment failure and keeps processing reserved", async () => {
    for (const [status, paymentIntentStatus, expected] of [
      ["expired", undefined, `released:${stripeSessionId}:reconciled_stripe_expired`],
      [
        "complete",
        "requires_payment_method",
        `released:${stripeSessionId}:reconciled_async_payment_failed`,
      ],
      ["complete", "processing", `awaiting:${stripeSessionId}`],
    ] as const) {
      const transitions: string[] = [];
      const claim = makeClaim({ status: "active", stripeSessionId });

      await reconcileInventoryReservations(
        {
          repository: makeRepository(claim, transitions),
          sessions: {
            create: async () => {
              throw new Error("Unexpected create.");
            },
            retrieve: async () => makeStripeSession(status, "unpaid", paymentIntentStatus),
          },
          handlePaidSession: async () => {},
          reportError: () => {},
        },
        { now },
      );

      expect(transitions).toEqual([expected]);
    }
  });

  test("isolates claim failures instead of aborting the bounded batch", async () => {
    const errors: unknown[] = [];
    const claim = makeClaim();
    const repository = makeRepository(claim, []);
    repository.claimReservation = async () => {
      throw new Error("Corrupt claim fixture.");
    };

    const result = await reconcileInventoryReservations(
      {
        repository,
        sessions: {
          create: async () => {
            throw new Error("Unexpected create.");
          },
          retrieve: async () => {
            throw new Error("Unexpected retrieve.");
          },
        },
        handlePaidSession: async () => {},
        reportError: (error) => errors.push(error),
      },
      { now },
    );

    expect(result).toMatchObject({ attempted: 0, failed: 1 });
    expect(errors).toHaveLength(1);
  });

  test("continues the batch when processing and its retry write both fail", async () => {
    const errors: unknown[] = [];
    const firstClaim = makeClaim({ token: "reservation_first_123456" });
    const secondClaim = makeClaim({
      id: "58ea47f3-a6ae-4cc9-9428-c14f3af238f6",
      token: "reservation_second_12345",
      stripeSessionId: "cs_test_second",
      status: "active",
    });
    const repository = makeRepository(firstClaim, []);
    repository.findDueReservationTokens = async () => [firstClaim.token, secondClaim.token];
    repository.claimReservation = async (token) =>
      token === firstClaim.token ? firstClaim : secondClaim;
    repository.deferReservation = async (claim) => {
      if (claim.id === firstClaim.id) {
        throw new Error("Retry write failed.");
      }

      return true;
    };

    const result = await reconcileInventoryReservations(
      {
        repository,
        sessions: {
          create: async (_params, options) => {
            if (options.idempotencyKey === firstClaim.stripeCreateIdempotencyKey) {
              throw new Error("Stripe request failed.");
            }

            return makeStripeSession("complete", "paid");
          },
          retrieve: async () => ({
            ...makeStripeSession("complete", "paid"),
            id: "cs_test_second",
          }),
        },
        handlePaidSession: async () => {},
        reportError: (error) => errors.push(error),
      },
      { now },
    );

    expect(result).toMatchObject({ attempted: 2, converted: 1, failed: 1 });
    expect(errors).toHaveLength(2);
  });

  test("compensates a definitive create failure inside Stripe's retention window", async () => {
    const transitions: string[] = [];
    const claim = makeClaim();

    const result = await reconcileInventoryReservations(
      {
        repository: makeRepository(claim, transitions),
        sessions: {
          create: async () => {
            throw { type: "StripeInvalidRequestError" };
          },
          retrieve: async () => {
            throw new Error("Unexpected retrieve.");
          },
        },
        handlePaidSession: async () => {},
        reportError: () => {},
      },
      { now },
    );

    expect(result).toMatchObject({ released: 1, failed: 0 });
    expect(transitions).toEqual(["released:none:stripe_session_creation_failed"]);
  });

  test("does not compensate a create error after Stripe may have pruned the idempotency key", async () => {
    const transitions: string[] = [];
    const claim = makeClaim({
      createdAt: new Date("2026-07-08T12:00:00.000Z"),
    });

    const result = await reconcileInventoryReservations(
      {
        repository: makeRepository(claim, transitions),
        sessions: {
          create: async () => {
            throw { type: "StripeInvalidRequestError" };
          },
          retrieve: async () => {
            throw new Error("Unexpected retrieve.");
          },
        },
        handlePaidSession: async () => {},
        reportError: () => {},
      },
      { now },
    );

    expect(result).toMatchObject({ released: 0, failed: 1 });
    expect(transitions).toEqual(["deferred:stripe_request_error"]);
  });
});
