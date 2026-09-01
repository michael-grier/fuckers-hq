import { describe, expect, test } from "bun:test";
import type Stripe from "stripe";

import { createPendingCheckoutLineSnapshots, resolveCheckoutLines } from "@/lib/checkout/items";
import type { ReservationEventWriter } from "@/lib/checkout/reservation-events";
import {
  assertInventoryDecremented,
  assertPendingCheckoutItemsMatchSnapshots,
  InventoryUnavailableError,
  type PaidCheckoutData,
  PaidOrderError,
  parsePendingCheckoutLineSnapshots,
  planInventoryAllocation,
  resolveOrderItemSnapshots,
} from "@/lib/orders/create-paid-order";
import type {
  PaidShippingPaymentData,
  ShippingPaymentEventWriter,
} from "@/lib/orders/delivery-review";
import {
  derivePaymentLifecycleState,
  type PaymentLifecycleUpdate,
  type PaymentLifecycleWriter,
} from "@/lib/orders/payment-lifecycle";
import {
  constructVerifiedStripeEvent,
  parsePaidCheckoutData,
  parsePaidShippingPaymentData,
  parsePaymentLifecycleUpdate,
  processStripeEvent,
  StripeWebhookSignatureError,
} from "@/lib/webhooks/stripe";

const variantId = "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6";
const shippingPaymentRequestId = "2c428c31-5462-42cc-8e0d-cebf749c046d";

function makeCheckoutSession(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "cs_test_paid",
    mode: "payment",
    payment_status: "paid",
    payment_intent: "pi_test_paid",
    metadata: {
      pendingCheckoutToken: "checkout_abcDEF123456789",
      reservationToken: "reservation_abcDEF123456",
    },
    customer_details: {
      email: "skater@example.com",
    },
    amount_subtotal: 8900,
    amount_total: 10400,
    currency: "CAD",
    total_details: {
      amount_shipping: 1500,
      amount_tax: 0,
    },
    shipping_cost: {
      amount_total: 1500,
    },
    collected_information: {
      shipping_details: {
        name: "Test Skater",
        address: {
          line1: "123 Test Street",
          city: "Calgary",
          state: "AB",
          postal_code: "T1T 1T1",
          country: "CA",
        },
      },
    },
    ...overrides,
  };
}

function makeShippingPaymentSession(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return makeCheckoutSession({
    id: "cs_test_shipping_payment",
    payment_intent: "pi_test_shipping_payment",
    metadata: {
      checkoutKind: "order_shipping_payment",
      shippingPaymentRequestId,
      shippingPaymentGeneration: "2",
    },
    amount_subtotal: 2000,
    amount_total: 2100,
    total_details: { amount_shipping: 0, amount_tax: 100 },
    shipping_cost: null,
    ...overrides,
  });
}

function makeRefundEvent(
  refundedCents: number,
  stripeEventId = "evt_refund_1",
  created = 1_784_700_000,
) {
  return {
    id: stripeEventId,
    created,
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_test_paid",
        payment_intent: "pi_test_paid",
        amount_refunded: refundedCents,
        currency: "CAD",
      },
    },
  };
}

function makeDisputeEvent(
  status: "needs_response" | "under_review" | "won" | "lost" | "prevented",
  stripeEventId: string,
  created: number,
  type = "charge.dispute.updated",
) {
  return {
    id: stripeEventId,
    created,
    type,
    data: {
      object: {
        id: "dp_test_paid",
        payment_intent: "pi_test_paid",
        status,
      },
    },
  };
}

function makeMemoryPaymentWriter() {
  const events = new Map<string, PaymentLifecycleUpdate>();
  let state = derivePaymentLifecycleState(10400, "cad", []);

  const writer: PaymentLifecycleWriter = {
    async recordPaymentLifecycleUpdate(update) {
      const changed = !events.has(update.stripeEventId);
      events.set(update.stripeEventId, update);
      state = derivePaymentLifecycleState(10400, "cad", [...events.values()]);
      return { changed, orderId: "order_123" };
    },
  };

  return {
    events,
    getState: () => state,
    writer,
  };
}

const unusedPaidOrderWriter = {
  createPaidOrder: async () => ({ created: true, orderId: "order_unused" }),
};

describe("Stripe webhook signatures", () => {
  test("passes the unchanged raw body to Stripe verification", () => {
    const expectedEvent = {
      type: "customer.created",
      data: { object: {} },
    } as unknown as Stripe.Event;

    const event = constructVerifiedStripeEvent(
      '{"raw":"body"}',
      "signature-header",
      "whsec_test",
      (payload, signature, secret) => {
        expect(payload).toBe('{"raw":"body"}');
        expect(signature).toBe("signature-header");
        expect(secret).toBe("whsec_test");
        return expectedEvent;
      },
    );

    expect(event).toBe(expectedEvent);
  });

  test("rejects missing and invalid signatures", () => {
    const unusedConstructor = () => ({}) as Stripe.Event;

    expect(() =>
      constructVerifiedStripeEvent("payload", null, "whsec_test", unusedConstructor),
    ).toThrow(StripeWebhookSignatureError);
    expect(() =>
      constructVerifiedStripeEvent("payload", "invalid", "whsec_test", () => {
        throw new Error("Signature mismatch");
      }),
    ).toThrow(StripeWebhookSignatureError);
  });
});

describe("paid Checkout Session parsing", () => {
  test("maps Stripe-authoritative totals, customer, shipping, and metadata", () => {
    expect(parsePaidCheckoutData(makeCheckoutSession())).toEqual({
      pendingCheckoutToken: "checkout_abcDEF123456789",
      reservationToken: "reservation_abcDEF123456",
      stripeSessionId: "cs_test_paid",
      stripePaymentIntentId: "pi_test_paid",
      email: "skater@example.com",
      subtotalCents: 8900,
      taxCents: 0,
      shippingCents: 1500,
      totalCents: 10400,
      currency: "cad",
      shippingAddress: {
        name: "Test Skater",
        address: {
          line1: "123 Test Street",
          city: "Calgary",
          state: "AB",
          postal_code: "T1T 1T1",
          country: "CA",
        },
      },
      destinationProvince: "AB",
    });
  });

  test("uses the customer address as a province fallback", () => {
    const checkout = makeCheckoutSession({
      customer_details: {
        email: "skater@example.com",
        address: { country: "ca", state: "sk" },
      },
      collected_information: null,
    });

    expect(parsePaidCheckoutData(checkout)).toMatchObject({
      shippingAddress: null,
      destinationProvince: "SK",
    });
  });

  test("preserves a paid order when Stripe omits a valid Canadian province", () => {
    const checkout = makeCheckoutSession({
      collected_information: {
        shipping_details: {
          name: "Test Skater",
          address: { country: "CA", state: "Alberta" },
        },
      },
    });

    expect(parsePaidCheckoutData(checkout)?.destinationProvince).toBeNull();
  });

  test("accepts zero tax and ignores unpaid completed Sessions", () => {
    expect(
      parsePaidCheckoutData(
        makeCheckoutSession({
          payment_status: "unpaid",
          total_details: null,
          shipping_cost: null,
        }),
      ),
    ).toBeNull();
  });

  test("ignores unrecognized metadata instead of discarding a verified payment", () => {
    // A Session created by a newer deploy can be paid while an older instance still receives the
    // webhook. Rejecting the unknown key would fail the delivery permanently and lose the order,
    // so unknown keys are ignored and never read.
    const parsed = parsePaidCheckoutData(
      makeCheckoutSession({
        metadata: {
          pendingCheckoutToken: "checkout_abcDEF123456789",
          reservationToken: "reservation_abcDEF123456",
          fulfillmentMethod: "delivery",
          cart: "untrusted",
        },
      }),
    );

    expect(parsed?.pendingCheckoutToken).toBe("checkout_abcDEF123456789");
    expect(parsed?.reservationToken).toBe("reservation_abcDEF123456");
    // The fulfillment method is read from the pending checkout row, never from Stripe metadata.
    expect(parsed).not.toHaveProperty("fulfillmentMethod");
    expect(parsed).not.toHaveProperty("cart");
  });

  test("still rejects metadata that cannot identify the pending checkout", () => {
    expect(() =>
      parsePaidCheckoutData(makeCheckoutSession({ metadata: { cart: "untrusted" } })),
    ).toThrow();
    expect(() =>
      parsePaidCheckoutData(makeCheckoutSession({ metadata: { pendingCheckoutToken: "short" } })),
    ).toThrow();
  });
});

describe("Stripe payment lifecycle parsing", () => {
  test("maps Stripe-authoritative aggregate refund amounts", () => {
    expect(parsePaymentLifecycleUpdate(makeRefundEvent(3200))).toEqual({
      stripeEventId: "evt_refund_1",
      stripePaymentIntentId: "pi_test_paid",
      kind: "refund",
      refundedCents: 3200,
      currency: "cad",
      disputeStatus: null,
      occurredAt: new Date(1_784_700_000 * 1000),
    });
  });

  test("normalizes active, won, lost, and prevented disputes", () => {
    expect(
      parsePaymentLifecycleUpdate(
        makeDisputeEvent("needs_response", "evt_dispute_open", 1_784_700_010),
      ),
    ).toMatchObject({ kind: "dispute", disputeStatus: "open" });
    expect(
      parsePaymentLifecycleUpdate(makeDisputeEvent("won", "evt_dispute_won", 1_784_700_020)),
    ).toMatchObject({ kind: "dispute", disputeStatus: "won" });
    expect(
      parsePaymentLifecycleUpdate(makeDisputeEvent("lost", "evt_dispute_lost", 1_784_700_020)),
    ).toMatchObject({ kind: "dispute", disputeStatus: "lost" });
    expect(
      parsePaymentLifecycleUpdate(
        makeDisputeEvent("prevented", "evt_dispute_prevented", 1_784_700_020),
      ),
    ).toMatchObject({ kind: "dispute", disputeStatus: "prevented" });
  });
});

describe("shipping payment Session parsing", () => {
  test("maps the supplemental amount, tax, payment identity, generation, and address", () => {
    expect(parsePaidShippingPaymentData(makeShippingPaymentSession())).toMatchObject({
      requestId: shippingPaymentRequestId,
      generation: 2,
      stripeSessionId: "cs_test_shipping_payment",
      stripePaymentIntentId: "pi_test_shipping_payment",
      subtotalCents: 2000,
      taxCents: 100,
      totalCents: 2100,
      currency: "cad",
      shippingAddress: {
        name: "Test Skater",
        address: { city: "Calgary", country: "CA" },
      },
      destinationProvince: "AB",
    });
  });
});

describe("Stripe event processing", () => {
  test("routes supplemental payment and expiration events without creating another order", async () => {
    let paidPayment: PaidShippingPaymentData | null = null;
    const closures: string[] = [];
    const shippingWriter: ShippingPaymentEventWriter = {
      recordPaidShippingPayment: async (payment) => {
        paidPayment = payment;
        return { changed: true, orderId: "order_shipping" };
      },
      closeShippingPayment: async (reference, reason) => {
        closures.push(`${reason}:${reference.generation}`);
        return { changed: true, orderId: "order_shipping" };
      },
    };
    let originalOrderWrites = 0;
    const originalWriter = {
      createPaidOrder: async () => {
        originalOrderWrites += 1;
        return { created: true, orderId: "wrong_order" };
      },
    };

    await expect(
      processStripeEvent(
        {
          type: "checkout.session.completed",
          data: { object: makeShippingPaymentSession() },
        },
        originalWriter,
        undefined,
        undefined,
        shippingWriter,
      ),
    ).resolves.toEqual({
      handled: true,
      shippingPaymentChanged: true,
      orderId: "order_shipping",
    });
    expect(paidPayment).toMatchObject({ requestId: shippingPaymentRequestId, generation: 2 });
    expect(originalOrderWrites).toBe(0);

    await processStripeEvent(
      {
        type: "checkout.session.expired",
        data: { object: makeShippingPaymentSession({ payment_status: "unpaid" }) },
      },
      originalWriter,
      undefined,
      undefined,
      shippingWriter,
    );
    expect(closures).toEqual(["expired:2"]);
  });

  test("ignores unrelated events and keeps unpaid Sessions reserved", async () => {
    let writes = 0;
    const reservationTransitions: string[] = [];
    const writer = {
      createPaidOrder: async () => {
        writes += 1;
        return { created: true, orderId: "order_unused" };
      },
    };
    const reservationWriter: ReservationEventWriter = {
      markAwaitingPayment: async (session) => {
        reservationTransitions.push(`awaiting:${session.stripeSessionId}`);
        return { changed: true };
      },
      releaseReservation: async (session, reason) => {
        reservationTransitions.push(`${reason}:${session.stripeSessionId}`);
        return { changed: true };
      },
    };

    expect(
      await processStripeEvent({ type: "product.created", data: { object: {} } }, writer),
    ).toEqual({ handled: false });
    expect(
      await processStripeEvent(
        {
          type: "checkout.session.completed",
          data: { object: makeCheckoutSession({ payment_status: "unpaid" }) },
        },
        writer,
        undefined,
        reservationWriter,
      ),
    ).toEqual({ handled: true, reservationChanged: true });
    expect(writes).toBe(0);
    expect(reservationTransitions).toEqual(["awaiting:cs_test_paid"]);
  });

  test("releases expired and failed asynchronous Sessions idempotently through the writer", async () => {
    const releases: string[] = [];
    const reservationWriter: ReservationEventWriter = {
      markAwaitingPayment: async () => ({ changed: true }),
      releaseReservation: async (session, reason) => {
        releases.push(`${reason}:${session.reservationToken}`);
        return { changed: releases.length === 1 };
      },
    };

    for (const [type, reservationChanged] of [
      ["checkout.session.expired", true],
      ["checkout.session.async_payment_failed", false],
    ] as const) {
      expect(
        await processStripeEvent(
          { type, data: { object: makeCheckoutSession({ payment_status: "unpaid" }) } },
          unusedPaidOrderWriter,
          undefined,
          reservationWriter,
        ),
      ).toEqual({ handled: true, reservationChanged });
    }

    expect(releases).toEqual([
      "stripe_session_expired:reservation_abcDEF123456",
      "async_payment_failed:reservation_abcDEF123456",
    ]);
  });

  test("ignores reservation lifecycle events without reservation metadata", async () => {
    expect(
      await processStripeEvent(
        {
          type: "checkout.session.expired",
          data: { object: makeCheckoutSession({ metadata: null, payment_status: "unpaid" }) },
        },
        unusedPaidOrderWriter,
        undefined,
        {
          markAwaitingPayment: async () => ({ changed: true }),
          releaseReservation: async () => ({ changed: true }),
        },
      ),
    ).toEqual({ handled: false });
  });

  test("passes a paid Session to persistence and reports idempotent results", async () => {
    let persistedCheckout: PaidCheckoutData | undefined;
    let alreadyCreated = false;
    const writer = {
      createPaidOrder: async (checkout: PaidCheckoutData) => {
        persistedCheckout = checkout;

        if (alreadyCreated) {
          return { created: false, orderId: "order_123" };
        }

        alreadyCreated = true;
        return { created: true, orderId: "order_123" };
      },
    };
    const event = {
      type: "checkout.session.completed",
      data: { object: makeCheckoutSession() },
    };

    expect(await processStripeEvent(event, writer)).toEqual({
      handled: true,
      created: true,
      orderId: "order_123",
    });
    expect(await processStripeEvent(event, writer)).toEqual({
      handled: true,
      created: false,
      orderId: "order_123",
    });
    expect(persistedCheckout?.stripeSessionId).toBe("cs_test_paid");
  });

  test("handles asynchronous payment success events through the same writer", async () => {
    const writer = {
      createPaidOrder: async () => ({ created: true, orderId: "order_async" }),
    };

    expect(
      await processStripeEvent(
        {
          type: "checkout.session.async_payment_succeeded",
          data: { object: makeCheckoutSession() },
        },
        writer,
      ),
    ).toEqual({ handled: true, created: true, orderId: "order_async" });
  });

  test("records partial and full refunds without reopening a fully refunded payment", async () => {
    const payment = makeMemoryPaymentWriter();

    await processStripeEvent(
      makeRefundEvent(3200, "evt_refund_partial"),
      unusedPaidOrderWriter,
      payment.writer,
    );
    expect(payment.getState()).toEqual({
      refundStatus: "partial",
      refundedCents: 3200,
      disputeStatus: "none",
    });

    await processStripeEvent(
      makeRefundEvent(10400, "evt_refund_full"),
      unusedPaidOrderWriter,
      payment.writer,
    );
    expect(payment.getState()).toEqual({
      refundStatus: "full",
      refundedCents: 10400,
      disputeStatus: "none",
    });

    await processStripeEvent(
      makeRefundEvent(3200, "evt_refund_older", 1_784_699_000),
      unusedPaidOrderWriter,
      payment.writer,
    );
    expect(payment.getState().refundStatus).toBe("full");
    expect(payment.getState().refundedCents).toBe(10400);
  });

  test("deduplicates replayed Stripe event ids", async () => {
    const payment = makeMemoryPaymentWriter();
    const event = makeRefundEvent(3200);

    expect(await processStripeEvent(event, unusedPaidOrderWriter, payment.writer)).toEqual({
      handled: true,
      paymentUpdated: true,
      changed: true,
      orderId: "order_123",
    });
    expect(await processStripeEvent(event, unusedPaidOrderWriter, payment.writer)).toEqual({
      handled: true,
      paymentUpdated: true,
      changed: false,
      orderId: "order_123",
    });
    expect(payment.events.size).toBe(1);
  });

  test("uses Stripe event time instead of delivery order for dispute state", async () => {
    const payment = makeMemoryPaymentWriter();

    await processStripeEvent(
      makeDisputeEvent("won", "evt_dispute_closed", 1_784_700_020, "charge.dispute.closed"),
      unusedPaidOrderWriter,
      payment.writer,
    );
    await processStripeEvent(
      makeDisputeEvent(
        "needs_response",
        "evt_dispute_created",
        1_784_700_010,
        "charge.dispute.created",
      ),
      unusedPaidOrderWriter,
      payment.writer,
    );

    expect(payment.getState().disputeStatus).toBe("won");
  });

  test("reconciles lifecycle events retained before paid order creation", () => {
    const refund = parsePaymentLifecycleUpdate(makeRefundEvent(10400, "evt_refund_before_order"));
    const dispute = parsePaymentLifecycleUpdate(
      makeDisputeEvent(
        "needs_response",
        "evt_dispute_before_order",
        1_784_700_010,
        "charge.dispute.created",
      ),
    );

    expect(
      derivePaymentLifecycleState(10400, "cad", [refund, dispute].filter(isPaymentUpdate)),
    ).toEqual({
      refundStatus: "full",
      refundedCents: 10400,
      disputeStatus: "open",
    });
  });
});

function isPaymentUpdate(update: PaymentLifecycleUpdate | null): update is PaymentLifecycleUpdate {
  return update !== null;
}

describe("paid order snapshots and inventory", () => {
  test("keeps Checkout snapshots immutable when catalog values change before payment", () => {
    const catalogAtCheckout = {
      id: variantId,
      productName: "Database Deck",
      productStatus: "active" as const,
      shippingProfile: "deck" as const,
      shippingRateCents: 2200,
      variantName: '8.25"',
      priceCents: 8900,
      inventoryQty: 3,
      reservedQty: 0,
    };
    const pendingSnapshots = createPendingCheckoutLineSnapshots(
      resolveCheckoutLines([{ variantId, quantity: 2 }], [catalogAtCheckout]),
    );

    catalogAtCheckout.productName = "Renamed Deck";
    catalogAtCheckout.variantName = '8.5"';
    catalogAtCheckout.priceCents = 9900;

    expect(
      resolveOrderItemSnapshots(parsePendingCheckoutLineSnapshots(pendingSnapshots), {
        subtotalCents: 17800,
        currency: "cad",
      }),
    ).toEqual([
      {
        variantId,
        productNameSnapshot: "Database Deck",
        variantNameSnapshot: '8.25"',
        unitPriceCentsSnapshot: 8900,
        quantity: 2,
      },
    ]);
  });

  test("rejects legacy, malformed, currency-mismatched, and unreconciled snapshots", () => {
    const snapshot = {
      variantId,
      productName: "Database Deck",
      variantName: '8.25"',
      unitPriceCents: 8900,
      quantity: 1,
      currency: "cad",
    };

    expect(() => parsePendingCheckoutLineSnapshots(null)).toThrow(PaidOrderError);
    expect(() => parsePendingCheckoutLineSnapshots([{ ...snapshot, productName: "" }])).toThrow(
      PaidOrderError,
    );
    expect(() =>
      assertPendingCheckoutItemsMatchSnapshots([{ variantId, quantity: 2 }], [snapshot]),
    ).toThrow("cart items do not match");
    expect(() =>
      assertPendingCheckoutItemsMatchSnapshots([{ variantId, quantity: 1 }], [snapshot]),
    ).not.toThrow();
    expect(() =>
      resolveOrderItemSnapshots([snapshot], { subtotalCents: 8900, currency: "usd" }),
    ).toThrow("currency does not match");
    expect(() =>
      resolveOrderItemSnapshots([snapshot], { subtotalCents: 9900, currency: "cad" }),
    ).toThrow("subtotal does not match");
  });

  test("fails conditional inventory misses", () => {
    expect(() => assertInventoryDecremented([], { variantId, quantity: 2 })).toThrow(
      InventoryUnavailableError,
    );
  });

  test("accepts exactly one matching conditional inventory update", () => {
    expect(() => assertInventoryDecremented([variantId], { variantId, quantity: 2 })).not.toThrow();
    expect(() =>
      assertInventoryDecremented([variantId, variantId], { variantId, quantity: 2 }),
    ).toThrow(InventoryUnavailableError);
    expect(() =>
      assertInventoryDecremented(["879dd483-16c9-4d6c-885f-b00525f84923"], {
        variantId,
        quantity: 2,
      }),
    ).toThrow(InventoryUnavailableError);
  });

  test("plans an all-or-nothing inventory exception when paid checkouts compete", () => {
    const paidItems = [{ variantId, quantity: 1 }];
    const firstPaidCheckout = planInventoryAllocation(paidItems, [
      { id: variantId, inventoryQty: 1 },
    ]);
    const competingPaidCheckout = planInventoryAllocation(paidItems, [
      { id: variantId, inventoryQty: 0 },
    ]);

    expect(firstPaidCheckout).toEqual({
      status: "allocated",
      lines: paidItems,
    });
    expect(competingPaidCheckout).toEqual({
      status: "exception",
      lines: [],
    });
    expect(planInventoryAllocation(paidItems, [{ id: variantId, inventoryQty: 0 }])).toEqual(
      competingPaidCheckout,
    );
  });

  test("does not partially allocate a multi-line paid order", () => {
    const secondVariantId = "879dd483-16c9-4d6c-885f-b00525f84923";

    expect(
      planInventoryAllocation(
        [
          { variantId, quantity: 1 },
          { variantId: secondVariantId, quantity: 2 },
        ],
        [
          { id: variantId, inventoryQty: 1 },
          { id: secondVariantId, inventoryQty: 1 },
        ],
      ),
    ).toEqual({ status: "exception", lines: [] });
  });
});
