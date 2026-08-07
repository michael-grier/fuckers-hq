import { describe, expect, test } from "bun:test";

import { nestedValidationFailure } from "@/lib/actions/result";
import { suggestProductSlug } from "@/lib/admin/product-slug";
import {
  adminProductComposerSchema,
  adminProductFormSchema,
  adminProductWorkspaceSchema,
  adminVariantCreateSchema,
  adminVariantFormSchema,
  slugSchema,
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

const existingVariantId = "10000000-0000-4000-8000-000000000001";

const workspacePayload = {
  productId,
  name: "Street Deck",
  slug: "street-deck",
  description: "",
  category: "hardgoods",
  status: "active",
  variants: [
    {
      variantId: existingVariantId,
      name: '8.0"',
      sku: "DECK-STREET-80",
      price: "89.00",
      inventory: "5",
    },
    { name: '8.25"', sku: "DECK-STREET-825", price: "94.00", inventory: "0" },
  ],
} as const;

describe("admin product workspace contract", () => {
  test("accepts existing and new variant rows in one payload", () => {
    const parsed = adminProductWorkspaceSchema.parse(workspacePayload);

    expect(parsed.variants[0].variantId).toBe(existingVariantId);
    expect(parsed.variants[1].variantId).toBeUndefined();
  });

  test("flags a duplicated SKU on the row that repeats it", () => {
    const result = adminProductWorkspaceSchema.safeParse({
      ...workspacePayload,
      variants: [
        workspacePayload.variants[0],
        { name: '8.25"', sku: "DECK-STREET-80", price: "94.00", inventory: "0" },
      ],
    });

    expect(result.success).toBe(false);
    expect(
      result.success ? [] : result.error.issues.map((issue) => issue.path.join(".")),
    ).toContain("variants.1.sku");
  });

  test("rejects unknown keys anywhere in the payload", () => {
    expect(
      adminProductWorkspaceSchema.safeParse({ ...workspacePayload, position: 1 }).success,
    ).toBe(false);
    expect(
      adminProductWorkspaceSchema.safeParse({
        ...workspacePayload,
        variants: [{ ...workspacePayload.variants[1], reservedQty: 3 }],
      }).success,
    ).toBe(false);
  });
});

describe("admin product composer contract", () => {
  const composerPayload = {
    productId,
    name: "Street Deck",
    slug: "street-deck",
    description: "",
    category: "hardgoods",
    intent: "draft",
    variants: [{ name: '8.0"', sku: "DECK-STREET-80", price: "89.00", inventory: "5" }],
    images: [],
  } as const;
  const ownedObjectKey = `products/${productId}/20000000-0000-4000-8000-000000000002-deck-front.jpg`;
  const foreignObjectKey =
    "products/00000000-0000-4000-8000-000000000009/20000000-0000-4000-8000-000000000002-deck-front.jpg";

  test("allows a draft with no variants but refuses to publish one", () => {
    expect(adminProductComposerSchema.safeParse({ ...composerPayload, variants: [] }).success).toBe(
      true,
    );

    const publish = adminProductComposerSchema.safeParse({
      ...composerPayload,
      intent: "publish",
      variants: [],
    });

    expect(publish.success).toBe(false);
    expect(
      publish.success ? [] : publish.error.issues.map((issue) => issue.path.join(".")),
    ).toContain("variants");
  });

  test("accepts image keys under the pre-generated product id and rejects foreign ones", () => {
    expect(
      adminProductComposerSchema.safeParse({
        ...composerPayload,
        images: [{ objectKey: ownedObjectKey, alt: "Deck, front" }],
      }).success,
    ).toBe(true);

    const foreign = adminProductComposerSchema.safeParse({
      ...composerPayload,
      images: [{ objectKey: foreignObjectKey, alt: "Deck, front" }],
    });

    expect(foreign.success).toBe(false);
    expect(
      foreign.success ? [] : foreign.error.issues.map((issue) => issue.path.join(".")),
    ).toContain("images.0.objectKey");
  });
});

describe("nested validation failure mapping", () => {
  test("keys field errors by the full dotted path so array rows stay addressable", () => {
    const result = adminProductWorkspaceSchema.safeParse({
      ...workspacePayload,
      variants: [{ name: "", sku: "DECK-STREET-80", price: "not-money", inventory: "5" }],
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const failure = nestedValidationFailure(result.error);

      expect(Object.keys(failure.fieldErrors ?? {})).toContain("variants.0.price");
      expect(Object.keys(failure.fieldErrors ?? {})).toContain("variants.0.name");
    }
  });
});

describe("suggestProductSlug", () => {
  test("folds names to the server slug contract", () => {
    expect(suggestProductSlug("Hellfire Deck")).toBe("hellfire-deck");
    expect(suggestProductSlug('  8.25" Deck — Édition Spéciale  ')).toBe(
      "8-25-deck-edition-speciale",
    );
    expect(suggestProductSlug("!!!")).toBe("");
  });

  test("always produces a slug the schema accepts (or empty)", () => {
    for (const name of ["Deck", "Crème Brûlée Tee", "A".repeat(300), "-- weird -- input --"]) {
      const slug = suggestProductSlug(name);

      if (slug !== "") {
        expect(slugSchema.safeParse(slug).success).toBe(true);
      }
    }
  });
});
