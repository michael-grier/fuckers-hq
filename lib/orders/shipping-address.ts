import { z } from "zod";

import {
  normalizeCanadianPostalCode,
  normalizeDeliveryStreetAddress,
  normalizeDeliveryUnitForMatch,
  parseDeliveryStreetAddress,
} from "@/lib/checkout/delivery-address";
import type { FulfillmentMethod } from "@/lib/db/schema";
import { deliveryAddressSchema } from "@/lib/validators/delivery";

const shippingDetailsSchema = z.object({
  name: z.string().min(1).optional(),
  address: z.object({
    line1: z.string().min(1).nullable().optional(),
    line2: z.string().min(1).nullable().optional(),
    city: z.string().min(1).nullable().optional(),
    state: z.string().min(1).nullable().optional(),
    postal_code: z.string().min(1).nullable().optional(),
    country: z.string().min(1).nullable().optional(),
  }),
});

export function getShippingAddressLines(input: unknown): string[] {
  const parsed = shippingDetailsSchema.safeParse(input);

  if (!parsed.success) {
    return [];
  }

  const { name, address } = parsed.data;
  const region = [address.state, address.postal_code].filter(Boolean).join(" ");
  const locality = [address.city, region].filter(Boolean).join(", ");

  return Array.from(
    new Set(
      [name, address.line1, address.line2, locality, address.country].filter(
        (line): line is string => Boolean(line),
      ),
    ),
  );
}

/** Missing or changed Stripe address data routes a delivery order to operator review. */
export function deliveryAddressRequiresReview(
  checkedAddress: unknown,
  shippingAddress: unknown,
): boolean {
  const checked = deliveryAddressSchema.safeParse(checkedAddress);

  if (!checked.success) {
    // Delivery reservations created before the geofence migration have no signed address proof.
    return true;
  }

  const parsed = shippingDetailsSchema.safeParse(shippingAddress);
  const line1 = parsed.success ? parsed.data.address.line1 : null;
  const line2 = parsed.success ? parsed.data.address.line2 : null;
  const postalCode = parsed.success ? parsed.data.address.postal_code : null;

  if (typeof line1 !== "string" || typeof postalCode !== "string") {
    return true;
  }

  const stripeStreet = parseDeliveryStreetAddress(line1);
  const stripeUnit = stripeStreet.unit ?? line2 ?? undefined;
  const checkedUnitMatches =
    !checked.data.unit ||
    (stripeUnit !== undefined &&
      normalizeDeliveryUnitForMatch(stripeUnit) ===
        normalizeDeliveryUnitForMatch(checked.data.unit));

  return (
    normalizeDeliveryStreetAddress(stripeStreet.line1) !==
      normalizeDeliveryStreetAddress(checked.data.line1) ||
    normalizeCanadianPostalCode(postalCode) !== checked.data.postalCode ||
    !checkedUnitMatches
  );
}

/** Carries earlier ambiguity forward and adds a review when Stripe collected another address. */
export function resolveDeliveryAddressReview(
  fulfillmentMethod: FulfillmentMethod,
  reviewAlreadyRequired: boolean,
  checkedAddress: unknown,
  shippingAddress: unknown,
): boolean {
  return (
    fulfillmentMethod === "delivery" &&
    (reviewAlreadyRequired || deliveryAddressRequiresReview(checkedAddress, shippingAddress))
  );
}
