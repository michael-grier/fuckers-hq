import { describe, expect, test } from "bun:test";

import {
  countAdminOrdersByFilter,
  filterAdminOrders,
  matchesAdminOrderFilter,
  orderNeedsAction,
} from "@/lib/admin/order-list";

type TestOrder = Parameters<typeof orderNeedsAction>[0] & { orderNumber: string; email: string };

function order(overrides: Partial<TestOrder> = {}): TestOrder {
  return {
    orderNumber: "FS-1000",
    email: "rider@example.com",
    status: "paid",
    inventoryStatus: "allocated",
    fulfillmentMethod: "shipping",
    deliveryReviewStatus: null,
    refundStatus: "none",
    disputeStatus: "none",
    confirmationDeliveryStatus: "sent",
    ...overrides,
  };
}

describe("orderNeedsAction", () => {
  test("flags paid orders whose inventory hit an exception", () => {
    expect(orderNeedsAction(order({ inventoryStatus: "exception" }))).toBe(true);
  });

  test("flags paid orders whose confirmation email terminally failed", () => {
    expect(orderNeedsAction(order({ confirmationDeliveryStatus: "failed" }))).toBe(true);
  });

  test("folds each unresolved local-delivery state into Needs action", () => {
    for (const deliveryReviewStatus of [
      "pending",
      "shipping_payment_pending",
      "shipping_payment_exception",
    ] as const) {
      expect(orderNeedsAction(order({ deliveryReviewStatus }))).toBe(true);
    }
    expect(orderNeedsAction(order({ deliveryReviewStatus: "approved" }))).toBe(false);
  });

  test("flags shipping payment exceptions after an order leaves paid", () => {
    expect(
      orderNeedsAction(
        order({ status: "refunded", deliveryReviewStatus: "shipping_payment_exception" }),
      ),
    ).toBe(true);
  });

  test("flags refunded allocated stock regardless of fulfillment state", () => {
    expect(orderNeedsAction(order({ refundStatus: "partial" }))).toBe(true);
    expect(orderNeedsAction(order({ refundStatus: "full", status: "fulfilled" }))).toBe(true);
    expect(
      orderNeedsAction(
        order({ refundStatus: "full", status: "fulfilled", inventoryStatus: "released" }),
      ),
    ).toBe(false);
  });

  test("ignores retryable delivery states the cron still owns", () => {
    expect(orderNeedsAction(order({ confirmationDeliveryStatus: "retry" }))).toBe(false);
    expect(orderNeedsAction(order({ confirmationDeliveryStatus: "pending" }))).toBe(false);
  });

  test("ignores unpaid orders regardless of inventory state", () => {
    expect(orderNeedsAction(order({ status: "pending", inventoryStatus: "exception" }))).toBe(
      false,
    );
  });

  test("ignores orders with no confirmation delivery record", () => {
    // getAdminOrders maps a missing delivery relation to null.
    expect(orderNeedsAction(order({ confirmationDeliveryStatus: null }))).toBe(false);
  });
});

describe("matchesAdminOrderFilter", () => {
  test("to-ship requires allocated stock and fulfillment eligibility", () => {
    expect(matchesAdminOrderFilter(order(), "to-ship")).toBe(true);
    expect(matchesAdminOrderFilter(order({ refundStatus: "full" }), "to-ship")).toBe(false);
    expect(matchesAdminOrderFilter(order({ disputeStatus: "open" }), "to-ship")).toBe(false);
    expect(matchesAdminOrderFilter(order({ inventoryStatus: "exception" }), "to-ship")).toBe(false);
    expect(
      matchesAdminOrderFilter(
        order({ deliveryReviewStatus: "shipping_payment_pending" }),
        "to-ship",
      ),
    ).toBe(false);
    expect(
      matchesAdminOrderFilter(
        order({ deliveryReviewStatus: "shipping_payment_received" }),
        "to-ship",
      ),
    ).toBe(true);
  });

  test("to-ship excludes delivery orders, which have their own queue", () => {
    expect(matchesAdminOrderFilter(order({ fulfillmentMethod: "delivery" }), "to-ship")).toBe(
      false,
    );
    // A scheduled delivery order stays fulfillment-eligible, so it would otherwise leak in here.
    expect(
      matchesAdminOrderFilter(
        order({ fulfillmentMethod: "delivery", status: "delivery_scheduled" }),
        "to-ship",
      ),
    ).toBe(false);
  });

  test("to-ship excludes orders that still need a human", () => {
    expect(
      matchesAdminOrderFilter(order({ confirmationDeliveryStatus: "failed" }), "to-ship"),
    ).toBe(false);
  });

  test("partially refunded orders move to needs-action until stock is decided", () => {
    const partiallyRefunded = order({ refundStatus: "partial" });

    expect(matchesAdminOrderFilter(partiallyRefunded, "needs-action")).toBe(true);
    expect(matchesAdminOrderFilter(partiallyRefunded, "to-ship")).toBe(false);
    expect(matchesAdminOrderFilter(partiallyRefunded, "refunded")).toBe(true);
  });

  test("shipped matches fulfilled orders only", () => {
    expect(matchesAdminOrderFilter(order({ status: "fulfilled" }), "shipped")).toBe(true);
    expect(matchesAdminOrderFilter(order(), "shipped")).toBe(false);
  });

  test("all matches everything", () => {
    expect(matchesAdminOrderFilter(order({ status: "cancelled" }), "all")).toBe(true);
  });
});

describe("filterAdminOrders", () => {
  const orders = [
    order({ orderNumber: "FS-1042", email: "kd@example.com", inventoryStatus: "exception" }),
    order({ orderNumber: "FS-1041", email: "tony@example.com" }),
    order({ orderNumber: "FS-1040", email: "ray@example.com", status: "fulfilled" }),
  ];

  test("combines workflow filter with a query over number and email", () => {
    expect(
      filterAdminOrders(orders, { q: "tony", filter: "all" }).map((o) => o.orderNumber),
    ).toEqual(["FS-1041"]);
    expect(filterAdminOrders(orders, { q: "FS-104", filter: "needs-action" })).toHaveLength(1);
    expect(filterAdminOrders(orders, { q: "nobody", filter: "all" })).toHaveLength(0);
  });

  test("matches case-insensitively and ignores surrounding whitespace", () => {
    expect(filterAdminOrders(orders, { q: "  KD@EXAMPLE.COM ", filter: "all" })).toHaveLength(1);
  });
});

describe("countAdminOrdersByFilter", () => {
  test("counts each workflow bucket", () => {
    const counts = countAdminOrdersByFilter([
      order({ inventoryStatus: "exception" }),
      order(),
      order({ status: "fulfilled" }),
      order({ refundStatus: "full", status: "fulfilled" }),
    ]);

    expect(counts).toEqual({
      all: 4,
      "needs-action": 2,
      "to-ship": 1,
      shipped: 2,
      refunded: 1,
    });
  });
});
