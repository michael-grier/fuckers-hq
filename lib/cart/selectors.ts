import type { CartDisplayLine, CartFulfillmentMethod, CheckoutRequest } from "./types";

/**
 * Delivery can be switched off between the moment a preference is stored and the moment checkout
 * starts, so the stored preference is only honoured while delivery is actually offered.
 */
export function resolveFulfillmentMethod(
  preference: CartFulfillmentMethod,
  isDeliveryAvailable: boolean,
): CartFulfillmentMethod {
  return preference === "delivery" && isDeliveryAvailable ? "delivery" : "shipping";
}

export function getCartItemCount(lines: CartDisplayLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function getCartSubtotalCents(lines: CartDisplayLine[]): number {
  return lines.reduce((total, line) => total + line.priceCents * line.quantity, 0);
}

/**
 * Identifies a checkout attempt so retries reuse one request ID. The fulfillment method is part of
 * the identity because a reserved checkout refuses to be replayed under a different method.
 */
export function getCheckoutCartFingerprint(
  lines: CartDisplayLine[],
  fulfillmentMethod: CartFulfillmentMethod,
): string {
  const canonicalLines = lines
    .map(({ variantId, quantity }) => ({ variantId, quantity }))
    .sort((left, right) => left.variantId.localeCompare(right.variantId));

  return JSON.stringify({ fulfillmentMethod, lines: canonicalLines });
}

export function toCheckoutRequest(
  lines: CartDisplayLine[],
  requestId: string,
  fulfillmentMethod: CartFulfillmentMethod,
  deliveryAddressReviewAcknowledged = false,
): CheckoutRequest {
  return {
    requestId,
    items: lines.map(({ variantId, quantity }) => ({
      variantId,
      quantity,
    })),
    fulfillmentMethod,
    ...(fulfillmentMethod === "delivery" ? { deliveryAddressReviewAcknowledged } : {}),
  };
}
