import type Stripe from "stripe";

import type { ShippingProfile } from "@/lib/catalog/shipping-profiles";
import type { PendingCheckoutLineSnapshot } from "@/lib/db/schema";
import type { CartLine } from "@/lib/validators/cart";

import { CheckoutError } from "./errors";

export const checkoutCurrency = "cad";

export type CheckoutVariantRecord = {
  id: string;
  productName: string;
  productStatus: "draft" | "active" | "archived";
  shippingProfile: ShippingProfile;
  shippingRateCents: number;
  variantName: string;
  priceCents: number;
  inventoryQty: number;
  reservedQty: number;
};

export type ResolvedCheckoutLine = CheckoutVariantRecord & {
  quantity: number;
};

export function combineCartLines(lines: CartLine[]): CartLine[] {
  const quantities = new Map<string, number>();

  for (const line of lines) {
    quantities.set(line.variantId, (quantities.get(line.variantId) ?? 0) + line.quantity);
  }

  return Array.from(quantities, ([variantId, quantity]) => ({ variantId, quantity }));
}

export function resolveCheckoutLines(
  cartLines: CartLine[],
  variants: CheckoutVariantRecord[],
): ResolvedCheckoutLine[] {
  const combinedLines = combineCartLines(cartLines);
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  return combinedLines.map((line) => {
    const variant = variantsById.get(line.variantId);

    if (variant?.productStatus !== "active") {
      throw new CheckoutError("One or more items are no longer available.", 404);
    }

    const availableQty = getAvailableInventoryQty(variant);

    if (availableQty < line.quantity) {
      throw new CheckoutError(
        `${variant.productName} (${variant.variantName}) only has ${availableQty} available.`,
        409,
      );
    }

    return {
      ...variant,
      quantity: line.quantity,
    };
  });
}

export function getAvailableInventoryQty(
  variant: Pick<CheckoutVariantRecord, "inventoryQty" | "reservedQty">,
): number {
  return variant.inventoryQty - variant.reservedQty;
}

export function buildStripeLineItems(
  lines: ResolvedCheckoutLine[],
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency: checkoutCurrency,
      unit_amount: line.priceCents,
      tax_behavior: "exclusive",
      product_data: {
        name: line.productName,
        description: line.variantName,
      },
    },
  }));
}

export function buildStripeLineItemsFromSnapshots(
  lines: PendingCheckoutLineSnapshot[],
): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return lines.map((line) => ({
    quantity: line.quantity,
    price_data: {
      currency: line.currency,
      unit_amount: line.unitPriceCents,
      tax_behavior: "exclusive",
      product_data: {
        name: line.productName,
        description: line.variantName,
      },
    },
  }));
}

export function createPendingCheckoutLineSnapshots(
  lines: ResolvedCheckoutLine[],
): PendingCheckoutLineSnapshot[] {
  return lines.map((line) => ({
    variantId: line.id,
    productName: line.productName,
    variantName: line.variantName,
    unitPriceCents: line.priceCents,
    quantity: line.quantity,
    currency: checkoutCurrency,
    shippingProfile: line.shippingProfile,
    shippingRateCents: line.shippingRateCents,
  }));
}

export function getCheckoutSubtotalCents(lines: ResolvedCheckoutLine[]): number {
  return lines.reduce((subtotal, line) => subtotal + line.priceCents * line.quantity, 0);
}

export function getCheckoutSnapshotSubtotalCents(lines: PendingCheckoutLineSnapshot[]): number {
  return lines.reduce((subtotal, line) => subtotal + line.unitPriceCents * line.quantity, 0);
}
