import { describe, expect, test } from "bun:test";

import {
  adminProductFormSchema,
  adminVariantCreateSchema,
  adminVariantFormSchema,
  toProductMutationValues,
  toVariantMutationValues,
} from "@/lib/validators/product";

const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";

describe("admin product form contract", () => {
  test("normalizes optional text fields for Postgres writes", () => {
    const input = adminProductFormSchema.parse({
      name: "Street Deck",
      slug: "street-deck",
      description: "  ",
      category: " hardgoods ",
      status: "draft",
    });

    expect(toProductMutationValues(input)).toEqual({
      name: "Street Deck",
      slug: "street-deck",
      description: null,
      category: "hardgoods",
      status: "draft",
    });
  });

  test("rejects invalid slugs and unknown fields", () => {
    expect(() =>
      adminProductFormSchema.parse({
        name: "Street Deck",
        slug: "Street Deck",
        description: "",
        category: "hardgoods",
        status: "active",
      }),
    ).toThrow();

    expect(() =>
      adminProductFormSchema.parse({
        name: "Street Deck",
        slug: "street-deck",
        description: "",
        category: "hardgoods",
        status: "active",
        clientPrice: 1,
      }),
    ).toThrow();
  });

  test("accepts only the three storefront product categories", () => {
    for (const category of ["hardgoods", "softgoods", "accessories"] as const) {
      expect(
        adminProductFormSchema.parse({
          name: "Category Test",
          slug: `category-${category}`,
          description: "",
          category,
          status: "draft",
        }).category,
      ).toBe(category);
    }

    for (const category of ["", "decks", "apparel", "custom"]) {
      expect(
        adminProductFormSchema.safeParse({
          name: "Category Test",
          slug: "category-test",
          description: "",
          category,
          status: "draft",
        }).success,
      ).toBe(false);
    }
  });
});

describe("admin variant form contract", () => {
  test("converts a dollar price and whole-number inventory to database integers", () => {
    const input = adminVariantFormSchema.parse({
      name: '8.25"',
      sku: "DECK-STREET-825",
      price: "89.95",
      inventory: "12",
    });

    expect(toVariantMutationValues(input)).toEqual({
      name: '8.25"',
      sku: "DECK-STREET-825",
      priceCents: 8995,
      inventoryQty: 12,
    });
  });

  test("rejects fractional inventory, over-precise prices, and missing product IDs", () => {
    expect(() =>
      adminVariantFormSchema.parse({
        name: "Small",
        sku: "TEE-SMALL",
        price: "34.999",
        inventory: "2.5",
      }),
    ).toThrow();

    expect(() =>
      adminVariantCreateSchema.parse({
        name: "Small",
        sku: "TEE-SMALL",
        price: "34.00",
        inventory: "2",
      }),
    ).toThrow();
  });

  test("accepts a server action payload with a valid product ID", () => {
    expect(
      adminVariantCreateSchema.parse({
        productId,
        name: "Small",
        sku: "TEE-SMALL",
        price: "34.00",
        inventory: "2",
      }),
    ).toMatchObject({ productId, price: "34.00", inventory: "2" });
  });
});
