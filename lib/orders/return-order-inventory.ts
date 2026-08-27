import type { Order } from "@/lib/db/schema";

export type OrderInventoryReturnResult =
  | "returned"
  | "already_returned"
  | "inventory_unavailable"
  | "invalid_status"
  | "not_found";

export type OrderInventoryReturnRepository = {
  returnRefundedOrderInventory: (orderId: string) => Promise<OrderInventoryReturnResult>;
};

export class OrderInventoryReturnError extends Error {
  constructor(
    message: string,
    readonly code: Exclude<OrderInventoryReturnResult, "returned" | "already_returned">,
  ) {
    super(message);
    this.name = "OrderInventoryReturnError";
  }
}

/** Whether a refund left allocated units that still need an operator decision. */
export function orderNeedsInventoryReturn(
  order: Pick<Order, "inventoryStatus" | "refundStatus">,
): boolean {
  return order.refundStatus !== "none" && order.inventoryStatus === "allocated";
}

/** Returns every allocated unit in a refunded order to sellable stock exactly once. */
export async function returnRefundedOrderInventory(
  orderId: string,
  repository: OrderInventoryReturnRepository,
): Promise<{ changed: boolean }> {
  const result = await repository.returnRefundedOrderInventory(orderId);

  switch (result) {
    case "returned":
      return { changed: true };
    case "already_returned":
      return { changed: false };
    case "inventory_unavailable":
      throw new OrderInventoryReturnError(
        "One or more order variants no longer exist or cannot accept more inventory. Update stock manually before trying again.",
        result,
      );
    case "invalid_status":
      throw new OrderInventoryReturnError(
        "Only refunded orders with allocated inventory can be returned to stock.",
        result,
      );
    case "not_found":
      throw new OrderInventoryReturnError("Order not found.", result);
  }
}
