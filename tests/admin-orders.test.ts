import { describe, expect, mock, test } from "bun:test";

import type { Order } from "@/lib/db/schema";
import { retryOrderConfirmationForAdmin } from "@/lib/email/retry-order-confirmation";
import {
  markOrderShipped,
  OrderFulfillmentError,
  type OrderFulfillmentRepository,
} from "@/lib/orders/mark-order-shipped";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import {
  type InventoryExceptionRepository,
  InventoryExceptionResolutionError,
  resolveInventoryException,
} from "@/lib/orders/resolve-inventory-exception";
import {
  markOrderShippedSchema,
  retryOrderConfirmationSchema,
  retryOrderInventoryAllocationSchema,
} from "@/lib/validators/admin";

const orderId = "823071ff-f180-43ed-82df-af334ccfe35a";
type FulfillmentState = Pick<
  Order,
  "status" | "inventoryStatus" | "refundStatus" | "disputeStatus"
>;

function makeRepository(
  overrides: Partial<OrderFulfillmentRepository> = {},
): OrderFulfillmentRepository {
  return {
    markPaidOrderFulfilled: mock(async () => true),
    findOrderFulfillmentState: mock(
      async (): Promise<FulfillmentState> => ({
        status: "paid",
        inventoryStatus: "allocated",
        refundStatus: "none",
        disputeStatus: "none",
      }),
    ),
    ...overrides,
  };
}

describe("mark order shipped contract", () => {
  test("accepts only an order UUID", () => {
    expect(markOrderShippedSchema.parse({ orderId })).toEqual({ orderId });
    expect(() => markOrderShippedSchema.parse({ orderId: "not-an-order" })).toThrow();
    expect(() => markOrderShippedSchema.parse({ orderId, status: "refunded" })).toThrow();
    expect(retryOrderInventoryAllocationSchema.parse({ orderId })).toEqual({ orderId });
  });

  test("conditionally changes a paid order to fulfilled", async () => {
    const repository = makeRepository();

    await expect(markOrderShipped(orderId, repository)).resolves.toEqual({ changed: true });
    expect(repository.markPaidOrderFulfilled).toHaveBeenCalledWith(orderId);
    expect(repository.findOrderFulfillmentState).not.toHaveBeenCalled();
  });

  test("treats an already fulfilled order as an idempotent success", async () => {
    const repository = makeRepository({
      markPaidOrderFulfilled: mock(async () => false),
      findOrderFulfillmentState: mock(
        async (): Promise<FulfillmentState> => ({
          status: "fulfilled",
          inventoryStatus: "allocated",
          refundStatus: "none",
          disputeStatus: "none",
        }),
      ),
    });

    await expect(markOrderShipped(orderId, repository)).resolves.toEqual({ changed: false });
  });

  test("rejects missing orders and invalid status transitions", async () => {
    const missingOrderRepository = makeRepository({
      markPaidOrderFulfilled: mock(async () => false),
      findOrderFulfillmentState: mock(async (): Promise<null> => null),
    });
    const refundedOrderRepository = makeRepository({
      markPaidOrderFulfilled: mock(async () => false),
      findOrderFulfillmentState: mock(
        async (): Promise<FulfillmentState> => ({
          status: "refunded",
          inventoryStatus: "allocated",
          refundStatus: "full",
          disputeStatus: "none",
        }),
      ),
    });

    await expect(markOrderShipped(orderId, missingOrderRepository)).rejects.toEqual(
      new OrderFulfillmentError("Order not found.", "not_found"),
    );
    await expect(markOrderShipped(orderId, refundedOrderRepository)).rejects.toEqual(
      new OrderFulfillmentError(
        "Only payment-eligible paid orders can be marked as shipped.",
        "invalid_status",
      ),
    );
  });

  test("blocks fulfillment while a paid order has an inventory exception", async () => {
    const repository = makeRepository({
      markPaidOrderFulfilled: mock(async () => false),
      findOrderFulfillmentState: mock(
        async (): Promise<FulfillmentState> => ({
          status: "paid",
          inventoryStatus: "exception",
          refundStatus: "none",
          disputeStatus: "none",
        }),
      ),
    });

    await expect(markOrderShipped(orderId, repository)).rejects.toEqual(
      new OrderFulfillmentError(
        "Resolve the inventory exception before marking this order as shipped.",
        "invalid_status",
      ),
    );
  });

  test("blocks fulfillment for fully refunded and ineligible dispute states", () => {
    expect(
      isOrderFulfillmentEligible({
        status: "paid",
        refundStatus: "partial",
        disputeStatus: "none",
      }),
    ).toBe(true);
    expect(
      isOrderFulfillmentEligible({
        status: "refunded",
        refundStatus: "full",
        disputeStatus: "none",
      }),
    ).toBe(false);
    expect(
      isOrderFulfillmentEligible({
        status: "paid",
        refundStatus: "none",
        disputeStatus: "open",
      }),
    ).toBe(false);
    expect(
      isOrderFulfillmentEligible({
        status: "paid",
        refundStatus: "none",
        disputeStatus: "lost",
      }),
    ).toBe(false);
    expect(
      isOrderFulfillmentEligible({
        status: "paid",
        refundStatus: "none",
        disputeStatus: "prevented",
      }),
    ).toBe(false);
    expect(
      isOrderFulfillmentEligible({
        status: "paid",
        refundStatus: "none",
        disputeStatus: "won",
      }),
    ).toBe(true);
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

describe("retry order confirmation authorization", () => {
  test("rejects unauthorized retries before attempting delivery", async () => {
    const attempt = mock(async () => ({ status: "sent" as const }));

    await expect(
      retryOrderConfirmationForAdmin(
        { orderId },
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

  test("validates input and permits an authorized retry", async () => {
    const authorize = mock(async () => ({ userId: "user_admin123" }));
    const attempt = mock(async () => ({ status: "sent" as const }));

    expect(retryOrderConfirmationSchema.parse({ orderId })).toEqual({ orderId });
    expect(() => retryOrderConfirmationSchema.parse({ orderId: "invalid" })).toThrow();
    await expect(
      retryOrderConfirmationForAdmin(
        { orderId },
        {
          authorize,
          attempt,
          reportError: () => {},
        },
      ),
    ).resolves.toEqual({ success: true, data: undefined });
    expect(authorize).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(orderId);
  });
});
