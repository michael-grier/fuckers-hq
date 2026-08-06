import type { FulfillmentMethod, Order, OrderEmailKind } from "@/lib/db/schema";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import type { ShippingCarrier } from "@/lib/orders/shipping-carriers";

/**
 * The operator-driven fulfillment steps.
 *
 * Shipping orders go paid → fulfilled in one step. Pickup orders go paid → ready_for_pickup →
 * fulfilled, because the customer has to be told to come collect the order before it can be handed
 * over. `fulfilled` is the shared terminal state for both methods.
 */
export const orderFulfillmentTransitionValues = ["ship", "ready_for_pickup", "picked_up"] as const;

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
   * change. Null for steps the customer has already been told about — collection happens in
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
  ready_for_pickup: {
    fromStatus: "paid",
    toStatus: "ready_for_pickup",
    requiredMethod: "pickup",
    invalidStatusMessage:
      "Only payment-eligible paid pickup orders can be marked ready for pickup.",
    queuedEmailKind: "pickup_ready",
  },
  picked_up: {
    fromStatus: "ready_for_pickup",
    toStatus: "fulfilled",
    requiredMethod: "pickup",
    invalidStatusMessage: "Only orders marked ready for pickup can be marked as picked up.",
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
    return "ready_for_pickup";
  }

  return order.status === "ready_for_pickup" ? "picked_up" : null;
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
  /** Only meaningful for `ship`; tracking has no meaning for an order collected in person. */
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
  // pickup transition and violate the orders_shipment_requires_shipping_method constraint.
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
      rule.requiredMethod === "pickup"
        ? "This is a shipping order and cannot be fulfilled through the pickup flow."
        : "This is a pickup order and cannot be marked as shipped.",
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
