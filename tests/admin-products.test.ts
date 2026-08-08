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
      subcategory: " decks ",
      status: "draft",
    });

    expect(toProductMutationValues(input)).toEqual({
      name: "Street Deck",
      slug: "street-deck",
      description: null,
      category: "hardgoods",
      subcategory: "decks",
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
        subcategory: "decks",
        status: "active",
      }),
    ).toThrow();

    expect(() =>
      adminProductFormSchema.parse({
        name: "Street Deck",
        slug: "street-deck",
        description: "",
        category: "hardgoods",
        subcategory: "decks",
        status: "active",
        clientPrice: 1,
      }),
    ).toThrow();
  });

  test("accepts only the three storefront product categories", () => {
    const subcategoryByCategory = {
      hardgoods: "decks",
      softgoods: "t-shirts",
      accessories: "stickers",
    } as const;

    for (const category of ["hardgoods", "softgoods", "accessories"] as const) {
      expect(
        adminProductFormSchema.parse({
          name: "Category Test",
          slug: `category-${category}`,
          description: "",
          category,
          subcategory: subcategoryByCategory[category],
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
          subcategory: "decks",
          status: "draft",
        }).success,
      ).toBe(false);
    }
  });

  test("rejects missing and mismatched category-subcategory pairs", () => {
    const base = {
      name: "Pair Test",
      slug: "pair-test",
      description: "",
      status: "draft",
    };

    expect(
      adminProductFormSchema.safeParse({ ...base, category: "hardgoods", subcategory: "" }).success,
    ).toBe(false);
    expect(
      adminProductFormSchema.safeParse({ ...base, category: "hardgoods", subcategory: "t-shirts" })
        .success,
    ).toBe(false);
    expect(
      adminProductFormSchema.safeParse({ ...base, category: "softgoods", subcategory: "buttons" })
        .success,
    ).toBe(false);

    const mismatch = adminProductFormSchema.safeParse({
      ...base,
      category: "accessories",
      subcategory: "wheels",
    });

    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues.some((issue) => issue.path.includes("subcategory"))).toBe(true);
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
