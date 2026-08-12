import type { FulfillmentMethod, Order, OrderEmailKind } from "@/lib/db/schema";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import type { ShippingCarrier } from "@/lib/orders/shipping-carriers";

/**
 * The operator-driven fulfillment steps.
 *
 * Shipping orders go paid → fulfilled in one step. Local-delivery orders go paid →
 * delivery_scheduled → fulfilled, because the customer has to be told a delivery is being
 * arranged before the order can be dropped off. `fulfilled` is the shared terminal state for
 * both methods.
 */
export const orderFulfillmentTransitionValues = ["ship", "schedule_delivery", "delivered"] as const;

export type OrderFulfillmentTransition = (typeof orderFulfillmentTransitionValues)[number];

export type OrderFulfillmentState = Pick<
  Order,
  "status" | "inventoryStatus" | "refundStatus" | "disputeStatus" | "fulfillmentMethod"
>;

/** The tracking an operator recorded when marking an order as shipped. */
export type OrderShipment = {
  carrier: ShippingCarrier;
  trackingNumber: string;
};

type TransitionRule = {
  fromStatus: Order["status"];
  toStatus: Order["status"];
  requiredMethod: FulfillmentMethod;
  /** Message used when the order is not in a state this transition can act on. */
  invalidStatusMessage: string;
  /**
   * Customer notification this transition owes, queued in the same transaction as the status
   * change. Null for steps the customer has already been told about — the drop-off happens in
   * person, so being handed the order is the notification.
   */
  queuedEmailKind: OrderEmailKind | null;
};

export const orderFulfillmentTransitionRules: Record<OrderFulfillmentTransition, TransitionRule> = {
  ship: {
    fromStatus: "paid",
    toStatus: "fulfilled",
    requiredMethod: "shipping",
    invalidStatusMessage: "Only payment-eligible paid shipping orders can be marked as shipped.",
    queuedEmailKind: "shipped",
  },
  schedule_delivery: {
    fromStatus: "paid",
    toStatus: "delivery_scheduled",
    requiredMethod: "delivery",
    invalidStatusMessage:
      "Only payment-eligible paid local-delivery orders can be scheduled for delivery.",
    queuedEmailKind: "delivery_scheduled",
  },
  delivered: {
    fromStatus: "delivery_scheduled",
    toStatus: "fulfilled",
    requiredMethod: "delivery",
    invalidStatusMessage: "Only orders scheduled for delivery can be marked as delivered.",
    queuedEmailKind: null,
  },
};

/**
 * The single fulfillment step available from an order's current state, or null when none is.
 * Keeps admin surfaces from offering a transition the server would reject.
 */
export function resolveNextFulfillmentTransition(
  order: Pick<Order, "status" | "fulfillmentMethod">,
): OrderFulfillmentTransition | null {
  if (order.fulfillmentMethod === "shipping") {
    return order.status === "paid" ? "ship" : null;
  }

  if (order.status === "paid") {
    return "schedule_delivery";
  }

  return order.status === "delivery_scheduled" ? "delivered" : null;
}

export type OrderFulfillmentRepository = {
  /**
   * Applies the transition only if the order still satisfies every guard, and reports whether it
   * changed. Guarding inside the write keeps two operators clicking at once from double-applying.
   */
  applyFulfillmentTransition: (
    orderId: string,
    transition: OrderFulfillmentTransition,
    occurredAt: Date,
    shipment: OrderShipment | null,
  ) => Promise<boolean>;
  findOrderFulfillmentState: (orderId: string) => Promise<OrderFulfillmentState | null>;
};

export class OrderFulfillmentError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "invalid_status",
  ) {
    super(message);
    this.name = "OrderFulfillmentError";
  }
}

export type ApplyOrderFulfillmentOptions = {
  now?: Date;
  /** Only meaningful for `ship`; tracking has no meaning for an order dropped off in person. */
  shipment?: OrderShipment | null;
};

export async function applyOrderFulfillmentTransition(
  orderId: string,
  transition: OrderFulfillmentTransition,
  repository: OrderFulfillmentRepository,
  options: ApplyOrderFulfillmentOptions = {},
): Promise<{ changed: boolean }> {
  const now = options.now ?? new Date();
  // Normalized here rather than trusted from the caller, so a shipment can never be attached to a
  // delivery transition and violate the orders_shipment_requires_shipping_method constraint.
  const shipment = transition === "ship" ? (options.shipment ?? null) : null;
  const changed = await repository.applyFulfillmentTransition(orderId, transition, now, shipment);

  if (changed) {
    return { changed: true };
  }

  const rule = orderFulfillmentTransitionRules[transition];
  const state = await repository.findOrderFulfillmentState(orderId);

  if (!state) {
    throw new OrderFulfillmentError("Order not found.", "not_found");
  }

  // A repeated click on an order that already reached the target state is a no-op, not an error.
  if (state.status === rule.toStatus) {
    return { changed: false };
  }

  if (state.fulfillmentMethod !== rule.requiredMethod) {
    throw new OrderFulfillmentError(
      rule.requiredMethod === "delivery"
        ? "This is a shipping order and cannot be fulfilled through the local-delivery flow."
        : "This is a local-delivery order and cannot be marked as shipped.",
      "invalid_status",
    );
  }

  if (!isOrderFulfillmentEligible(state)) {
    throw new OrderFulfillmentError(rule.invalidStatusMessage, "invalid_status");
  }

  if (state.inventoryStatus === "exception") {
    throw new OrderFulfillmentError(
      "Resolve the inventory exception before fulfilling this order.",
      "invalid_status",
    );
  }

  throw new OrderFulfillmentError(rule.invalidStatusMessage, "invalid_status");
}
