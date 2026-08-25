import { describe, expect, test } from "bun:test";

import { adminNavGroups, isAdminNavLinkActive } from "@/components/admin/admin-nav";
import {
  adminShippingRatesFormSchema,
  toShippingRateMutationValues,
} from "@/lib/validators/shipping-rates";

const validRates = {
  deck: "22.00",
  softgood: "12",
  flat: "3.5",
};

describe("admin shipping rate contract", () => {
  test("converts the complete dollar configuration to canonical integer cents", () => {
    const parsed = adminShippingRatesFormSchema.parse(validRates);

    expect(toShippingRateMutationValues(parsed)).toEqual([
      { profile: "deck", rateCents: 2200 },
      { profile: "softgood", rateCents: 1200 },
      { profile: "flat", rateCents: 350 },
    ]);
  });

  test("rejects missing, negative, over-precise, oversized, and unknown values", () => {
    expect(adminShippingRatesFormSchema.safeParse({ ...validRates, deck: "" }).success).toBe(false);
    expect(adminShippingRatesFormSchema.safeParse({ ...validRates, deck: "-1" }).success).toBe(
      false,
    );
    expect(adminShippingRatesFormSchema.safeParse({ ...validRates, deck: "1.001" }).success).toBe(
      false,
    );
    expect(
      adminShippingRatesFormSchema.safeParse({ ...validRates, deck: "21474836.48" }).success,
    ).toBe(false);
    expect(adminShippingRatesFormSchema.safeParse({ deck: "22", flat: "3" }).success).toBe(false);
    expect(adminShippingRatesFormSchema.safeParse({ ...validRates, currency: "CAD" }).success).toBe(
      false,
    );
  });
});

describe("admin shipping rate navigation", () => {
  test("places shipping rates in its own Store group", () => {
    const storeGroup = adminNavGroups.find((group) => group.label === "Store");

    expect(storeGroup?.links.map((link) => [link.label, link.href])).toEqual([
      ["Shipping rates", "/admin/shipping-rates"],
    ]);
    const shippingRatesLink = storeGroup?.links[0];

    if (!shippingRatesLink) {
      throw new Error("Shipping rates navigation link is missing.");
    }

    expect(isAdminNavLinkActive("/admin/shipping-rates", shippingRatesLink)).toBe(true);
  });
});
