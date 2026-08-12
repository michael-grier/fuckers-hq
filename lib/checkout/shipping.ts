import type Stripe from "stripe";

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
  standardRateCents: number;
  /** Omitted when the store charges a flat rate with no free-shipping tier. */
  freeThresholdCents?: number;
};

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
          amount: qualifiesForFreeShipping ? 0 : settings.standardRateCents,
          currency: "cad",
        },
        tax_behavior: "exclusive",
      },
    },
  ];
}
