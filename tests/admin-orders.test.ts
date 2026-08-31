import { describe, expect, mock, test } from "bun:test";

import type { Order } from "@/lib/db/schema";
import { retryOrderEmailForAdmin } from "@/lib/email/retry-order-email";
import {
  applyOrderFulfillmentTransition,
  OrderFulfillmentError,
  type OrderFulfillmentRepository,
  type OrderFulfillmentState,
  orderFulfillmentTransitionRules,
} from "@/lib/orders/order-fulfillment";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import {
  type InventoryExceptionRepository,
  InventoryExceptionResolutionError,
  resolveInventoryException,
} from "@/lib/orders/resolve-inventory-exception";
import {
  OrderInventoryReturnError,
  type OrderInventoryReturnRepository,
  returnRefundedOrderInventory,
} from "@/lib/orders/return-order-inventory";
import {
  adminOrderIdSchema,
  markOrderShippedSchema,
  retryOrderEmailSchema,
  retryOrderInventoryAllocationSchema,
  returnOrderInventorySchema,
} from "@/lib/validators/admin";

const orderId = "823071ff-f180-43ed-82df-af334ccfe35a";

function makeState(overrides: Partial<OrderFulfillmentState> = {}): OrderFulfillmentState {
  return {
    status: "paid",
    inventoryStatus: "allocated",
    refundStatus: "none",
    disputeStatus: "none",
    fulfillmentMethod: "shipping",
    deliveryReviewStatus: null,
    ...overrides,
  };
}

function makeRepository(
  overrides: Partial<OrderFulfillmentRepository> = {},
): OrderFulfillmentRepository {
  return {
    applyFulfillmentTransition: mock(async () => true),
    findOrderFulfillmentState: mock(async () => makeState()),
    ...overrides,
  };
}

function makeBlockedRepository(state: OrderFulfillmentState | null): OrderFulfillmentRepository {
  return makeRepository({
    applyFulfillmentTransition: mock(async () => false),
    findOrderFulfillmentState: mock(async () => state),
  });
}

describe("order fulfillment transitions", () => {
  test("accepts an order UUID with optional tracking", () => {
    expect(markOrderShippedSchema.parse({ orderId })).toEqual({ orderId });
    expect(() => markOrderShippedSchema.parse({ orderId: "not-an-order" })).toThrow();
    expect(() => markOrderShippedSchema.parse({ orderId, status: "refunded" })).toThrow();
    expect(adminOrderIdSchema.parse({ orderId })).toEqual({ orderId });
    expect(retryOrderInventoryAllocationSchema.parse({ orderId })).toEqual({ orderId });
    expect(returnOrderInventorySchema.parse({ orderId })).toEqual({ orderId });
  });

  test("normalizes a tracking pair and rejects a half-filled one", () => {
    expect(
      markOrderShippedSchema.parse({
        orderId,
        trackingCarrier: "canada_post",
        trackingNumber: "  1234  5678  9123  4567 ",
      }),
    ).toEqual({
      orderId,
      trackingCarrier: "canada_post",
      trackingNumber: "1234 5678 9123 4567",
    });

    // Blank strings are how the admin form reports "no tracking"; they must not fail validation.
    expect(
      markOrderShippedSchema.parse({ orderId, trackingCarrier: "", trackingNumber: "   " }),
    ).toEqual({ orderId });

    expect(() =>
      markOrderShippedSchema.parse({ orderId, trackingCarrier: "canada_post" }),
    ).toThrow();
    expect(() => markOrderShippedSchema.parse({ orderId, trackingNumber: "1Z999" })).toThrow();
    expect(() =>
      markOrderShippedSchema.parse({
        orderId,
        trackingCarrier: "ups",
        trackingNumber: "1Z999AA10123456784",
      }),
    ).toThrow();
  });

  test("accepts Canada Post formats and checks international S10 digits", () => {
    expect(
      markOrderShippedSchema.parse({
        orderId,
        trackingCarrier: "canada_post",
        trackingNumber: "CX473124829CA",
      }),
    ).toMatchObject({ trackingNumber: "CX473124829CA" });
    expect(
      markOrderShippedSchema.parse({
        orderId,
        trackingCarrier: "canada_post",
        trackingNumber: "1234-5678-9123-4567",
      }),
    ).toMatchObject({ trackingNumber: "1234-5678-9123-4567" });

    for (const trackingNumber of ["1234 5678", "CX47312482CA", "CX473124828CA"]) {
      const result = markOrderShippedSchema.safeParse({
        orderId,
        trackingCarrier: "canada_post",
        trackingNumber,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        expect(result.error.flatten().fieldErrors.trackingNumber).toContain(
          "Enter a 16-digit Canada Post tracking number or a 13-character number with 2 letters, 9 digits, and CA.",
        );
      }
    }
  });

  test("refuses a tracking number that could carry markup or a link into the email", () => {
    for (const trackingNumber of [
      "https://evil.example.com/track",
      "<b>1Z999</b>",
      "1Z999\nBcc: someone@example.com",
      "1Z999?redirect=x",
    ]) {
      expect(() =>
        markOrderShippedSchema.parse({ orderId, trackingCarrier: "canada_post", trackingNumber }),
      ).toThrow();
    }
  });

  test("conditionally changes a paid shipping order to fulfilled", async () => {
    const repository = makeRepository();
    const now = new Date("2026-08-04T12:00:00.000Z");

    await expect(
      applyOrderFulfillmentTransition(orderId, "ship", repository, { now }),
    ).resolves.toEqual({ changed: true });
    expect(repository.applyFulfillmentTransition).toHaveBeenCalledWith(orderId, "ship", now, null);
    expect(repository.findOrderFulfillmentState).not.toHaveBeenCalled();
  });

  test("records the shipment against a ship transition only", async () => {
    const shipment = {
      carrier: "canada_post",
      trackingNumber: "1234 5678 9123 4567",
    } as const;
    const shippingRepository = makeRepository();
    const deliveryRepository = makeRepository();
    const now = new Date("2026-08-04T12:00:00.000Z");

    await applyOrderFulfillmentTransition(orderId, "ship", shippingRepository, { now, shipment });
    expect(shippingRepository.applyFulfillmentTransition).toHaveBeenCalledWith(
      orderId,
      "ship",
      now,
      shipment,
    );

    // Tracking has no meaning for an order dropped off in person, and persisting it would violate
    // the orders_shipment_requires_shipping_method constraint.
    await applyOrderFulfillmentTransition(orderId, "schedule_delivery", deliveryRepository, {
      now,
      shipment,
    });
    expect(deliveryRepository.applyFulfillmentTransition).toHaveBeenCalledWith(
      orderId,
      "schedule_delivery",
      now,
      null,
    );
  });

  test("queues the customer notification each transition owes", () => {
    expect(orderFulfillmentTransitionRules.ship.queuedEmailKind).toBe("shipped");
    expect(orderFulfillmentTransitionRules.schedule_delivery.queuedEmailKind).toBe(
      "delivery_scheduled",
    );
    // The drop-off happens in person, so being handed the order is the notification.
    expect(orderFulfillmentTransitionRules.delivered.queuedEmailKind).toBeNull();
  });

  test("schedules a paid delivery order, then completes it on drop-off", async () => {
    const readyRepository = makeRepository();
    const deliveredRepository = makeRepository();

    await expect(
      applyOrderFulfillmentTransition(orderId, "schedule_delivery", readyRepository),
    ).resolves.toEqual({ changed: true });
    await expect(
      applyOrderFulfillmentTransition(orderId, "delivered", deliveredRepository),
    ).resolves.toEqual({ changed: true });
  });

  test("treats a repeated transition as an idempotent success", async () => {
    const shipped = makeBlockedRepository(makeState({ status: "fulfilled" }));
    const staged = makeBlockedRepository(
      makeState({ status: "delivery_scheduled", fulfillmentMethod: "delivery" }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "ship", shipped)).resolves.toEqual({
      changed: false,
    });
    await expect(
      applyOrderFulfillmentTransition(orderId, "schedule_delivery", staged),
    ).resolves.toEqual({ changed: false });
  });

  test("refuses to fulfill an order through the wrong method's flow", async () => {
    const shippingOrder = makeBlockedRepository(makeState({ fulfillmentMethod: "shipping" }));
    const deliveryOrder = makeBlockedRepository(makeState({ fulfillmentMethod: "delivery" }));

    await expect(
      applyOrderFulfillmentTransition(orderId, "schedule_delivery", shippingOrder),
    ).rejects.toEqual(
      new OrderFulfillmentError(
        "This is a shipping order and cannot be fulfilled through the local-delivery flow.",
        "invalid_status",
      ),
    );
    await expect(applyOrderFulfillmentTransition(orderId, "ship", deliveryOrder)).rejects.toEqual(
      new OrderFulfillmentError(
        "This is a local-delivery order and cannot be marked as shipped.",
        "invalid_status",
      ),
    );
  });

  test("rejects missing orders and payment-ineligible transitions", async () => {
    await expect(
      applyOrderFulfillmentTransition(orderId, "ship", makeBlockedRepository(null)),
    ).rejects.toEqual(new OrderFulfillmentError("Order not found.", "not_found"));
    await expect(
      applyOrderFulfillmentTransition(
        orderId,
        "ship",
        makeBlockedRepository(makeState({ status: "refunded", refundStatus: "full" })),
      ),
    ).rejects.toEqual(
      new OrderFulfillmentError(
        "Only payment-eligible paid shipping orders can be marked as shipped.",
        "invalid_status",
      ),
    );
  });

  test("stops a scheduled delivery order that was later refunded in full", async () => {
    const repository = makeBlockedRepository(
      makeState({
        status: "delivery_scheduled",
        fulfillmentMethod: "delivery",
        refundStatus: "full",
      }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "delivered", repository)).rejects.toEqual(
      new OrderFulfillmentError(
        "Only orders scheduled for delivery can be marked as delivered.",
        "invalid_status",
      ),
    );
  });

  test("blocks fulfillment while a paid order has an inventory exception", async () => {
    const shipping = makeBlockedRepository(makeState({ inventoryStatus: "exception" }));
    const deliveryBlocked = makeBlockedRepository(
      makeState({
        inventoryStatus: "exception",
        fulfillmentMethod: "delivery",
        deliveryReviewStatus: "approved",
      }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "ship", shipping)).rejects.toEqual(
      new OrderFulfillmentError(
        "Resolve the inventory exception before fulfilling this order.",
        "invalid_status",
      ),
    );
    await expect(
      applyOrderFulfillmentTransition(orderId, "schedule_delivery", deliveryBlocked),
    ).rejects.toEqual(
      new OrderFulfillmentError(
        "Resolve the inventory exception before fulfilling this order.",
        "invalid_status",
      ),
    );
  });

  test("blocks delivery scheduling until the address is approved", async () => {
    const unreviewed = makeBlockedRepository(
      makeState({ fulfillmentMethod: "delivery", deliveryReviewStatus: "pending" }),
    );

    await expect(
      applyOrderFulfillmentTransition(orderId, "schedule_delivery", unreviewed),
    ).rejects.toEqual(
      new OrderFulfillmentError(
        "Approve this delivery address before scheduling the order.",
        "invalid_status",
      ),
    );
  });

  test("blocks converted shipping until its supplemental payment is eligible", async () => {
    const paymentPending = makeBlockedRepository(
      makeState({ deliveryReviewStatus: "shipping_payment_pending" }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "ship", paymentPending)).rejects.toEqual(
      new OrderFulfillmentError(
        "Resolve the shipping-payment review before marking this order as shipped.",
        "invalid_status",
      ),
    );
  });

  test("blocks fulfillment for fully refunded and ineligible dispute states", () => {
    const eligible = (order: Pick<Order, "status" | "refundStatus" | "disputeStatus">) =>
      isOrderFulfillmentEligible(order);

    expect(eligible({ status: "paid", refundStatus: "partial", disputeStatus: "none" })).toBe(true);
    // A scheduled delivery order is still awaiting drop-off, so it stays eligible.
    expect(
      eligible({ status: "delivery_scheduled", refundStatus: "none", disputeStatus: "none" }),
    ).toBe(true);
    expect(
      eligible({ status: "delivery_scheduled", refundStatus: "full", disputeStatus: "none" }),
    ).toBe(false);
    expect(
      eligible({ status: "delivery_scheduled", refundStatus: "none", disputeStatus: "open" }),
    ).toBe(false);
    expect(eligible({ status: "refunded", refundStatus: "full", disputeStatus: "none" })).toBe(
      false,
    );
    expect(eligible({ status: "paid", refundStatus: "none", disputeStatus: "open" })).toBe(false);
    expect(eligible({ status: "paid", refundStatus: "none", disputeStatus: "lost" })).toBe(false);
    expect(eligible({ status: "paid", refundStatus: "none", disputeStatus: "prevented" })).toBe(
      false,
    );
    expect(eligible({ status: "paid", refundStatus: "none", disputeStatus: "won" })).toBe(true);
    expect(eligible({ status: "fulfilled", refundStatus: "none", disputeStatus: "none" })).toBe(
      false,
    );
  });
});

describe("refunded order inventory returns", () => {
  function makeReturnRepository(
    result: Awaited<ReturnType<OrderInventoryReturnRepository["returnRefundedOrderInventory"]>>,
  ): OrderInventoryReturnRepository {
    return {
      returnRefundedOrderInventory: mock(async () => result),
    };
  }

  test("returns allocated units once and treats a replay as idempotent", async () => {
    await expect(
      returnRefundedOrderInventory(orderId, makeReturnRepository("returned")),
    ).resolves.toEqual({ changed: true });
    await expect(
      returnRefundedOrderInventory(orderId, makeReturnRepository("already_returned")),
    ).resolves.toEqual({ changed: false });
  });

  test("rejects an unrefunded or unallocated order", async () => {
    await expect(
      returnRefundedOrderInventory(orderId, makeReturnRepository("invalid_status")),
    ).rejects.toEqual(
      new OrderInventoryReturnError(
        "Only refunded orders with allocated inventory can be returned to stock.",
        "invalid_status",
      ),
    );
  });

  test("keeps the order allocated if its catalog variants cannot be restored", async () => {
    await expect(
      returnRefundedOrderInventory(orderId, makeReturnRepository("inventory_unavailable")),
    ).rejects.toEqual(
      new OrderInventoryReturnError(
        "One or more order variants no longer exist or cannot accept more inventory. Update stock manually before trying again.",
        "inventory_unavailable",
      ),
    );
  });
});

describe("inventory exception resolution", () => {
  function makeInventoryRepository(
    result: Awaited<ReturnType<InventoryExceptionRepository["allocateInventoryForException"]>>,
  ): InventoryExceptionRepository {
    return {
      allocateInventoryForException: mock(async () => result),
    };
  }

  test("allocates corrected stock once and treats a replay as idempotent", async () => {
    await expect(
      resolveInventoryException(orderId, makeInventoryRepository("allocated")),
    ).resolves.toEqual({ changed: true });
    await expect(
      resolveInventoryException(orderId, makeInventoryRepository("already_allocated")),
    ).resolves.toEqual({ changed: false });
  });

  test("keeps the exception when inventory is still insufficient", async () => {
    await expect(
      resolveInventoryException(orderId, makeInventoryRepository("insufficient_inventory")),
    ).rejects.toEqual(
      new InventoryExceptionResolutionError(
        "Inventory is still insufficient. Restock the affected variants and try again.",
        "insufficient_inventory",
      ),
    );
  });

  test("blocks retries when the order is no longer payment eligible", async () => {
    await expect(
      resolveInventoryException(orderId, makeInventoryRepository("invalid_status")),
    ).rejects.toEqual(
      new InventoryExceptionResolutionError(
        "Only payment-eligible paid orders with an inventory exception can retry allocation.",
        "invalid_status",
      ),
    );
  });
});

describe("retry order email authorization", () => {
  test("rejects unauthorized retries before attempting delivery", async () => {
    const attempt = mock(async () => ({ status: "sent" as const }));

    await expect(
      retryOrderEmailForAdmin(
        { orderId, kind: "confirmation" },
        {
          authorize: async () => {
            throw new Error("Not authorized");
          },
          attempt,
          reportError: () => {},
        },
      ),
    ).rejects.toThrow("Not authorized");
    expect(attempt).not.toHaveBeenCalled();
  });

  test("validates input and permits an authorized retry of either email", async () => {
    const authorize = mock(async () => ({ userId: "user_admin123" }));
    const attempt = mock(async () => ({ status: "sent" as const }));

    expect(retryOrderEmailSchema.parse({ orderId, kind: "delivery_scheduled" })).toEqual({
      orderId,
      kind: "delivery_scheduled",
    });
    expect(() => retryOrderEmailSchema.parse({ orderId, kind: "unknown" })).toThrow();
    expect(() => retryOrderEmailSchema.parse({ orderId })).toThrow();

    await expect(
      retryOrderEmailForAdmin(
        { orderId, kind: "delivery_scheduled" },
        { authorize, attempt, reportError: () => {} },
      ),
    ).resolves.toEqual({ success: true, data: undefined });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith({ orderId, kind: "delivery_scheduled" });
  });

  test("names the failing email when delivery is deferred", async () => {
    await expect(
      retryOrderEmailForAdmin(
        { orderId, kind: "delivery_scheduled" },
        {
          authorize: async () => ({}),
          attempt: async () => ({ status: "failed", error: new Error("nope"), terminal: false }),
          reportError: () => {},
        },
      ),
    ).resolves.toEqual({
      success: false,
      message: "Delivery notification delivery failed and was scheduled to retry.",
    });
  });
});
