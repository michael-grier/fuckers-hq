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
  adminOrderIdSchema,
  markOrderShippedSchema,
  retryOrderEmailSchema,
  retryOrderInventoryAllocationSchema,
} from "@/lib/validators/admin";

const orderId = "823071ff-f180-43ed-82df-af334ccfe35a";

function makeState(overrides: Partial<OrderFulfillmentState> = {}): OrderFulfillmentState {
  return {
    status: "paid",
    inventoryStatus: "allocated",
    refundStatus: "none",
    disputeStatus: "none",
    fulfillmentMethod: "shipping",
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
  });

  test("normalizes a tracking pair and rejects a half-filled one", () => {
    expect(
      markOrderShippedSchema.parse({
        orderId,
        trackingCarrier: "canada_post",
        trackingNumber: "  1234  5678 ",
      }),
    ).toEqual({ orderId, trackingCarrier: "canada_post", trackingNumber: "1234 5678" });

    // Blank strings are how the admin form reports "no tracking"; they must not fail validation.
    expect(
      markOrderShippedSchema.parse({ orderId, trackingCarrier: "", trackingNumber: "   " }),
    ).toEqual({ orderId });

    expect(() =>
      markOrderShippedSchema.parse({ orderId, trackingCarrier: "canada_post" }),
    ).toThrow();
    expect(() => markOrderShippedSchema.parse({ orderId, trackingNumber: "1Z999" })).toThrow();
    expect(() =>
      markOrderShippedSchema.parse({ orderId, trackingCarrier: "pigeon", trackingNumber: "1Z999" }),
    ).toThrow();
  });

  test("refuses a tracking number that could carry markup or a link into the email", () => {
    for (const trackingNumber of [
      "https://evil.example.com/track",
      "<b>1Z999</b>",
      "1Z999\nBcc: someone@example.com",
      "1Z999?redirect=x",
    ]) {
      expect(() =>
        markOrderShippedSchema.parse({ orderId, trackingCarrier: "ups", trackingNumber }),
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
    const shipment = { carrier: "canada_post", trackingNumber: "1234 5678" } as const;
    const shippingRepository = makeRepository();
    const pickupRepository = makeRepository();
    const now = new Date("2026-08-04T12:00:00.000Z");

    await applyOrderFulfillmentTransition(orderId, "ship", shippingRepository, { now, shipment });
    expect(shippingRepository.applyFulfillmentTransition).toHaveBeenCalledWith(
      orderId,
      "ship",
      now,
      shipment,
    );

    // Tracking has no meaning for an order collected in person, and persisting it would violate
    // the orders_shipment_requires_shipping_method constraint.
    await applyOrderFulfillmentTransition(orderId, "ready_for_pickup", pickupRepository, {
      now,
      shipment,
    });
    expect(pickupRepository.applyFulfillmentTransition).toHaveBeenCalledWith(
      orderId,
      "ready_for_pickup",
      now,
      null,
    );
  });

  test("queues the customer notification each transition owes", () => {
    expect(orderFulfillmentTransitionRules.ship.queuedEmailKind).toBe("shipped");
    expect(orderFulfillmentTransitionRules.ready_for_pickup.queuedEmailKind).toBe("pickup_ready");
    // Collection happens in person, so being handed the order is the notification.
    expect(orderFulfillmentTransitionRules.picked_up.queuedEmailKind).toBeNull();
  });

  test("stages a paid pickup order, then completes it on collection", async () => {
    const readyRepository = makeRepository();
    const collectedRepository = makeRepository();

    await expect(
      applyOrderFulfillmentTransition(orderId, "ready_for_pickup", readyRepository),
    ).resolves.toEqual({ changed: true });
    await expect(
      applyOrderFulfillmentTransition(orderId, "picked_up", collectedRepository),
    ).resolves.toEqual({ changed: true });
  });

  test("treats a repeated transition as an idempotent success", async () => {
    const shipped = makeBlockedRepository(makeState({ status: "fulfilled" }));
    const staged = makeBlockedRepository(
      makeState({ status: "ready_for_pickup", fulfillmentMethod: "pickup" }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "ship", shipped)).resolves.toEqual({
      changed: false,
    });
    await expect(
      applyOrderFulfillmentTransition(orderId, "ready_for_pickup", staged),
    ).resolves.toEqual({ changed: false });
  });

  test("refuses to fulfill an order through the wrong method's flow", async () => {
    const shippingOrder = makeBlockedRepository(makeState({ fulfillmentMethod: "shipping" }));
    const pickupOrder = makeBlockedRepository(makeState({ fulfillmentMethod: "pickup" }));

    await expect(
      applyOrderFulfillmentTransition(orderId, "ready_for_pickup", shippingOrder),
    ).rejects.toEqual(
      new OrderFulfillmentError(
        "This is a shipping order and cannot be fulfilled through the pickup flow.",
        "invalid_status",
      ),
    );
    await expect(applyOrderFulfillmentTransition(orderId, "ship", pickupOrder)).rejects.toEqual(
      new OrderFulfillmentError(
        "This is a pickup order and cannot be marked as shipped.",
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

  test("stops a staged pickup order that was later refunded in full", async () => {
    const repository = makeBlockedRepository(
      makeState({
        status: "ready_for_pickup",
        fulfillmentMethod: "pickup",
        refundStatus: "full",
      }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "picked_up", repository)).rejects.toEqual(
      new OrderFulfillmentError(
        "Only orders marked ready for pickup can be marked as picked up.",
        "invalid_status",
      ),
    );
  });

  test("blocks fulfillment while a paid order has an inventory exception", async () => {
    const shipping = makeBlockedRepository(makeState({ inventoryStatus: "exception" }));
    const pickup = makeBlockedRepository(
      makeState({ inventoryStatus: "exception", fulfillmentMethod: "pickup" }),
    );

    await expect(applyOrderFulfillmentTransition(orderId, "ship", shipping)).rejects.toEqual(
      new OrderFulfillmentError(
        "Resolve the inventory exception before fulfilling this order.",
        "invalid_status",
      ),
    );
    await expect(
      applyOrderFulfillmentTransition(orderId, "ready_for_pickup", pickup),
    ).rejects.toEqual(
      new OrderFulfillmentError(
        "Resolve the inventory exception before fulfilling this order.",
        "invalid_status",
      ),
    );
  });

  test("blocks fulfillment for fully refunded and ineligible dispute states", () => {
    const eligible = (order: Pick<Order, "status" | "refundStatus" | "disputeStatus">) =>
      isOrderFulfillmentEligible(order);

    expect(eligible({ status: "paid", refundStatus: "partial", disputeStatus: "none" })).toBe(true);
    // A staged pickup order is still awaiting hand-off, so it stays eligible.
    expect(
      eligible({ status: "ready_for_pickup", refundStatus: "none", disputeStatus: "none" }),
    ).toBe(true);
    expect(
      eligible({ status: "ready_for_pickup", refundStatus: "full", disputeStatus: "none" }),
    ).toBe(false);
    expect(
      eligible({ status: "ready_for_pickup", refundStatus: "none", disputeStatus: "open" }),
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

    expect(retryOrderEmailSchema.parse({ orderId, kind: "pickup_ready" })).toEqual({
      orderId,
      kind: "pickup_ready",
    });
    expect(() => retryOrderEmailSchema.parse({ orderId, kind: "unknown" })).toThrow();
    expect(() => retryOrderEmailSchema.parse({ orderId })).toThrow();

    await expect(
      retryOrderEmailForAdmin(
        { orderId, kind: "pickup_ready" },
        { authorize, attempt, reportError: () => {} },
      ),
    ).resolves.toEqual({ success: true, data: undefined });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith({ orderId, kind: "pickup_ready" });
  });

  test("names the failing email when delivery is deferred", async () => {
    await expect(
      retryOrderEmailForAdmin(
        { orderId, kind: "pickup_ready" },
        {
          authorize: async () => ({}),
          attempt: async () => ({ status: "failed", error: new Error("nope"), terminal: false }),
          reportError: () => {},
        },
      ),
    ).resolves.toEqual({
      success: false,
      message: "Pickup notification delivery failed and was scheduled to retry.",
    });
  });
});
