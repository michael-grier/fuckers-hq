import type { Order, OrderConfirmationDelivery } from "@/lib/db/schema";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";

export const adminOrderFilterValues = [
  "all",
  "needs-action",
  "to-ship",
  "shipped",
  "refunded",
] as const;
export type AdminOrderFilter = (typeof adminOrderFilterValues)[number];

type FilterableOrder = Pick<
  Order,
  "orderNumber" | "email" | "status" | "inventoryStatus" | "refundStatus" | "disputeStatus"
> & {
  confirmationDeliveryStatus: OrderConfirmationDelivery["status"] | null;
};

/**
 * An order needs a human when payment succeeded but fulfillment cannot proceed:
 * stock was never allocated, or the confirmation email exhausted its retries.
 */
export function orderNeedsAction(order: FilterableOrder): boolean {
  if (order.status !== "paid") {
    return false;
  }

  return order.inventoryStatus === "exception" || order.confirmationDeliveryStatus === "failed";
}

function isAwaitingShipment(order: FilterableOrder): boolean {
  return order.inventoryStatus === "allocated" && isOrderFulfillmentEligible(order);
}

export function matchesAdminOrderFilter(order: FilterableOrder, filter: AdminOrderFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "needs-action":
      return orderNeedsAction(order);
    case "to-ship":
      return isAwaitingShipment(order) && !orderNeedsAction(order);
    case "shipped":
      return order.status === "fulfilled";
    case "refunded":
      return order.refundStatus !== "none";
  }
}

export function filterAdminOrders<T extends FilterableOrder>(
  orders: readonly T[],
  filters: { q: string; filter: AdminOrderFilter },
): T[] {
  const query = filters.q.trim().toLowerCase();

  return orders.filter((order) => {
    if (!matchesAdminOrderFilter(order, filters.filter)) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      order.orderNumber.toLowerCase().includes(query) || order.email.toLowerCase().includes(query)
    );
  });
}

export function countAdminOrdersByFilter(
  orders: readonly FilterableOrder[],
): Record<AdminOrderFilter, number> {
  return {
    all: orders.length,
    "needs-action": orders.filter((order) => matchesAdminOrderFilter(order, "needs-action")).length,
    "to-ship": orders.filter((order) => matchesAdminOrderFilter(order, "to-ship")).length,
    shipped: orders.filter((order) => matchesAdminOrderFilter(order, "shipped")).length,
    refunded: orders.filter((order) => matchesAdminOrderFilter(order, "refunded")).length,
  };
}
