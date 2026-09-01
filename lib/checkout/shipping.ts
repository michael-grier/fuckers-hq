import type Stripe from "stripe";

import type { ShippingProfile } from "@/lib/catalog/shipping-profiles";

import { CheckoutError } from "./errors";

export type AllowedShippingCountry =
  Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry;

const supportedShippingCountries = new Set<AllowedShippingCountry>(["CA", "US"]);

export function parseAllowedShippingCountries(value: string): AllowedShippingCountry[] {
  const countries = Array.from(
    new Set(
      value
        .split(",")
        .map((country) => country.trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  if (
    countries.length === 0 ||
    countries.some((country) => !supportedShippingCountries.has(country as AllowedShippingCountry))
  ) {
    throw new CheckoutError("SHIPPING_ALLOWED_COUNTRIES must contain only CA and/or US.", 500);
  }

  return countries as AllowedShippingCountry[];
}

type ShippingSettings = {
  rateCents: number;
  /** Omitted when the store charges a flat rate with no free-shipping tier. */
  freeThresholdCents?: number;
};

type ShippingRateCartItem = {
  shippingProfile?: ShippingProfile;
  shippingRateCents?: number;
};

/** Resolves a cart to its most expensive persisted product shipping rate. */
export function resolveShippingRate(cartItems: readonly ShippingRateCartItem[]): number {
  let highestRateCents = 0;

  for (const item of cartItems) {
    if (
      item.shippingProfile === undefined ||
      item.shippingRateCents === undefined ||
      !Number.isSafeInteger(item.shippingRateCents) ||
      item.shippingRateCents < 0
    ) {
      throw new CheckoutError("Shipping is not configured for one or more products.", 500);
    }

    highestRateCents = Math.max(highestRateCents, item.shippingRateCents);
  }

  return highestRateCents;
}

export function buildShippingOptions(
  subtotalCents: number,
  settings: ShippingSettings,
): Stripe.Checkout.SessionCreateParams.ShippingOption[] {
  // An absent threshold means no order qualifies. Treating it as 0 would make every order ship
  // free, so the check is on the threshold being configured at all, not on its value.
  const qualifiesForFreeShipping =
    settings.freeThresholdCents !== undefined && subtotalCents >= settings.freeThresholdCents;

  return [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: qualifiesForFreeShipping ? "Free shipping" : "Standard shipping",
        fixed_amount: {
          amount: qualifiesForFreeShipping ? 0 : settings.rateCents,
          currency: "cad",
        },
        tax_behavior: "exclusive",
        tax_code: "txcd_92010001",
      },
    },
  ];
}
