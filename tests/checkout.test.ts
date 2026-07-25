import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";

import { isCompletedPaidCheckout } from "@/lib/checkout/completion";
import {
  type CheckoutRepository,
  createHostedCheckout,
} from "@/lib/checkout/create-hosted-checkout";
import { toCheckoutErrorResponse } from "@/lib/checkout/error-response";
import { CheckoutError } from "@/lib/checkout/errors";
import {
  buildStripeLineItems,
  type CheckoutVariantRecord,
  createPendingCheckoutLineSnapshots,
  resolveCheckoutLines,
} from "@/lib/checkout/items";
import { buildShippingOptions, parseAllowedShippingCountries } from "@/lib/checkout/shipping";
import { checkoutSchema } from "@/lib/validators/cart";

const variantId = "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6";
const requestId = "a593031e-8306-46c9-b92d-caa1d274405d";
const activeVariant: CheckoutVariantRecord = {
  id: variantId,
  productName: "Database Deck",
  productStatus: "active",
  variantName: '8.25"',
  priceCents: 8900,
  inventoryQty: 3,
  reservedQty: 0,
};
const reservationLineItems = [
  {
    variantId,
    productName: "Database Deck",
    variantName: '8.25"',
    unitPriceCents: 8900,
    quantity: 2,
    currency: "cad",
  },
];
const settings = {
  appUrl: "http://localhost:3000",
  allowedCountries: ["CA", "US"] as const,
  standardShippingRateCents: 1500,
  freeShippingThresholdCents: 10000,
  taxEnabled: true,
};

function makeRepository(overrides: Partial<CheckoutRepository> = {}): CheckoutRepository {
  return {
    reserveCheckout: async () => ({
      pendingCheckoutToken: "checkout_abcDEF123456789",
      reservationToken: "reservation_abcDEF123456",
      stripeCreateIdempotencyKey: "checkout-session/reservation_abcDEF123456",
      stripeSessionId: null,
      stripeSessionParams: null,
      expiresAt: new Date("2026-07-10T13:00:00.000Z"),
      lineItems: reservationLineItems,
    }),
    prepareStripeSession: async (_reservationToken, params) => params,
    linkStripeSession: async () => {},
    releaseSessionCreationFailure: async () => true,
    ...overrides,
  };
}

describe("checkout completion", () => {
  test("clears purchase intent only for completed paid sessions", () => {
    expect(isCompletedPaidCheckout({ status: "complete", payment_status: "paid" })).toBe(true);
    expect(
      isCompletedPaidCheckout({ status: "complete", payment_status: "no_payment_required" }),
    ).toBe(true);
    expect(isCompletedPaidCheckout({ status: "open", payment_status: "paid" })).toBe(false);
    expect(isCompletedPaidCheckout({ status: "complete", payment_status: "unpaid" })).toBe(false);
  });
});

describe("checkout error reporting boundary", () => {
  test("reports only unexpected and internal failures", async () => {
    const reportedErrors: unknown[] = [];
    const invalid = checkoutSchema.safeParse({ requestId, items: [] });

    if (invalid.success) {
      throw new Error("Expected invalid checkout input.");
    }

    const validationResponse = toCheckoutErrorResponse(invalid.error, (error) => {
      reportedErrors.push(error);
    });
    const stockResponse = toCheckoutErrorResponse(
      new CheckoutError("Only 1 item remains.", 409),
      (error) => reportedErrors.push(error),
    );
    const databaseError = new Error("Database unavailable.");
    const databaseResponse = toCheckoutErrorResponse(databaseError, (error) => {
      reportedErrors.push(error);
    });

    expect(validationResponse.status).toBe(400);
    expect(stockResponse.status).toBe(409);
    expect(await stockResponse.json()).toEqual({ error: "Only 1 item remains." });
    expect(databaseResponse.status).toBe(500);
    expect(await databaseResponse.json()).toEqual({ error: "Unable to start checkout." });
    expect(reportedErrors).toEqual([databaseError]);
  });
});

describe("checkout item resolution", () => {
  test("constructs Stripe lines only from server-resolved fields", () => {
    const [resolvedLine] = resolveCheckoutLines([{ variantId, quantity: 2 }], [activeVariant]);

    expect(buildStripeLineItems([resolvedLine])).toEqual([
      {
        quantity: 2,
        price_data: {
          currency: "cad",
          unit_amount: 8900,
          tax_behavior: "exclusive",
          product_data: {
            name: "Database Deck",
            description: '8.25"',
          },
        },
      },
    ]);
  });

  test("uses on-hand minus reserved inventory after combining duplicate lines", () => {
    expect(() =>
      resolveCheckoutLines(
        [
          { variantId, quantity: 1 },
          { variantId, quantity: 1 },
        ],
        [{ ...activeVariant, reservedQty: 2 }],
      ),
    ).toThrow("only has 1 available");
  });

  test("rejects unknown and inactive variants", () => {
    expect(() => resolveCheckoutLines([{ variantId, quantity: 1 }], [])).toThrow(CheckoutError);
    expect(() =>
      resolveCheckoutLines(
        [{ variantId, quantity: 1 }],
        [{ ...activeVariant, productStatus: "archived" }],
      ),
    ).toThrow(CheckoutError);
  });
});

describe("checkout shipping", () => {
  test("selects standard and free rates around the configured threshold", () => {
    expect(
      buildShippingOptions(9999, {
        standardRateCents: 1500,
        freeThresholdCents: 10000,
      })[0].shipping_rate_data?.fixed_amount?.amount,
    ).toBe(1500);
    expect(
      buildShippingOptions(10000, {
        standardRateCents: 1500,
        freeThresholdCents: 10000,
      })[0].shipping_rate_data?.fixed_amount?.amount,
    ).toBe(0);
  });

  test("normalizes and validates configured countries", () => {
    expect(parseAllowedShippingCountries("ca, US,ca")).toEqual(["CA", "US"]);
    expect(() => parseAllowedShippingCountries("CA,GB")).toThrow("must contain only CA and/or US");
  });
});

describe("hosted checkout orchestration", () => {
  test("validates input before reserving stock", async () => {
    let repositoryCalled = false;

    await expect(
      createHostedCheckout(
        { requestId, items: [] },
        { ...settings, allowedCountries: [...settings.allowedCountries] },
        {
          repository: makeRepository({
            reserveCheckout: async () => {
              repositoryCalled = true;
              throw new Error("Unexpected reservation call.");
            },
          }),
          sessions: {
            create: async () => ({ id: "cs_test_unused", url: null }),
          },
          createToken: () => "unused-token",
        },
      ),
    ).rejects.toThrow();

    expect(repositoryCalled).toBe(false);
  });

  test("reserves first, persists the exact request, and uses stable Stripe metadata", async () => {
    const reservationWrites: Parameters<CheckoutRepository["reserveCheckout"]>[0][] = [];
    const links: Array<{ token: string; sessionId: string }> = [];
    const idempotencyKeys: string[] = [];
    let sessionParams: Stripe.Checkout.SessionCreateParams | undefined;
    const now = new Date("2026-07-10T12:00:00.000Z");
    const tokens = ["checkout_abcDEF123456789", "reservation_abcDEF123456"];
    const repository = makeRepository({
      reserveCheckout: async (checkout) => {
        reservationWrites.push(checkout);
        return {
          pendingCheckoutToken: checkout.pendingCheckoutToken,
          reservationToken: checkout.reservationToken,
          stripeCreateIdempotencyKey: `checkout-session/${checkout.reservationToken}`,
          stripeSessionId: null,
          stripeSessionParams: null,
          expiresAt: checkout.expiresAt,
          lineItems: reservationLineItems,
        };
      },
      prepareStripeSession: async (_token, params) => {
        sessionParams = params;
        return params;
      },
      linkStripeSession: async (token, sessionId) => {
        links.push({ token, sessionId });
      },
    });

    const result = await createHostedCheckout(
      {
        requestId,
        items: [
          { variantId, quantity: 1 },
          { variantId, quantity: 1 },
        ],
      },
      {
        ...settings,
        appUrl: "http://localhost:3000/",
        allowedCountries: [...settings.allowedCountries],
        freeShippingThresholdCents: 20000,
      },
      {
        repository,
        sessions: {
          create: async (_params, options) => {
            idempotencyKeys.push(options.idempotencyKey);
            return { id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/test" };
          },
        },
        createToken: () => tokens.shift() ?? "unexpected",
        now: () => now,
      },
    );

    expect(result).toEqual({ url: "https://checkout.stripe.com/c/pay/test" });
    expect(reservationWrites).toEqual([
      {
        requestId,
        pendingCheckoutToken: "checkout_abcDEF123456789",
        reservationToken: "reservation_abcDEF123456",
        items: [
          { variantId, quantity: 1 },
          { variantId, quantity: 1 },
        ],
        expiresAt: new Date("2026-07-10T13:00:00.000Z"),
        nextReconcileAt: new Date("2026-07-10T12:05:00.000Z"),
      },
    ]);
    expect(sessionParams?.metadata).toEqual({
      pendingCheckoutToken: "checkout_abcDEF123456789",
      reservationToken: "reservation_abcDEF123456",
    });
    expect(sessionParams?.client_reference_id).toBe("reservation_abcDEF123456");
    expect(sessionParams?.after_expiration).toEqual({ recovery: { enabled: false } });
    expect(sessionParams?.expires_at).toBe(1783688400);
    expect(sessionParams?.line_items?.[0]).toMatchObject({
      quantity: 2,
      price_data: { unit_amount: 8900 },
    });
    expect(idempotencyKeys).toEqual(["checkout-session/reservation_abcDEF123456"]);
    expect(links).toEqual([{ token: "reservation_abcDEF123456", sessionId: "cs_test_123" }]);
  });

  test("uses the same immutable snapshots for persistence and Stripe", () => {
    const [resolvedLine] = resolveCheckoutLines([{ variantId, quantity: 2 }], [activeVariant]);

    expect(createPendingCheckoutLineSnapshots([resolvedLine])).toEqual(reservationLineItems);
    expect(buildStripeLineItems([resolvedLine])[0]).toMatchObject({
      quantity: 2,
      price_data: {
        currency: "cad",
        unit_amount: 8900,
        product_data: { name: "Database Deck", description: '8.25"' },
      },
    });
  });

  test("releases confirmed Stripe rejections but preserves ambiguous failures", async () => {
    const releases: string[] = [];
    const repository = makeRepository({
      releaseSessionCreationFailure: async (token) => {
        releases.push(token);
        return true;
      },
    });

    for (const [type, expectedReleases] of [
      ["StripeInvalidRequestError", 1],
      ["StripeConnectionError", 1],
    ] as const) {
      await expect(
        createHostedCheckout(
          { requestId, items: [{ variantId, quantity: 2 }] },
          { ...settings, allowedCountries: [...settings.allowedCountries] },
          {
            repository,
            sessions: {
              create: async () => {
                throw { type };
              },
            },
            createToken: () => "checkout_abcDEF123456789",
          },
        ),
      ).rejects.toEqual({ type });
      expect(releases).toHaveLength(expectedReleases);
    }
  });

  test("leaves a successfully created but unlinked Session for reconciliation", async () => {
    const releases: string[] = [];

    await expect(
      createHostedCheckout(
        { requestId, items: [{ variantId, quantity: 2 }] },
        { ...settings, allowedCountries: [...settings.allowedCountries] },
        {
          repository: makeRepository({
            linkStripeSession: async () => {
              throw new Error("Database link failed.");
            },
            releaseSessionCreationFailure: async (token) => {
              releases.push(token);
              return true;
            },
          }),
          sessions: {
            create: async () => ({
              id: "cs_test_unlinked",
              url: "https://checkout.stripe.com/unlinked",
            }),
          },
          createToken: () => "checkout_abcDEF123456789",
        },
      ),
    ).rejects.toThrow("Database link failed.");

    expect(releases).toEqual([]);
  });
});
