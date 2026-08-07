import { describe, expect, test } from "bun:test";

import { getCartItemCount, getCartSubtotalCents, toCheckoutRequest } from "@/lib/cart/selectors";
import {
  getCanonicalCatalogCategoryUrl,
  getCatalogHeading,
  getLegacyProductCategoryAlias,
  getProductCategoryForSubcategory,
  getProductCategoryLabel,
  getProductSubcategoryLabel,
  getProductSubcategoryOptions,
  isProductSubcategory,
  isValidProductTaxonomyPair,
  productSubcategories,
  productSubcategoryValues,
} from "@/lib/catalog/categories";
import {
  catalogFilterUrlOptions,
  catalogSearchParamsCache,
  withFirstCatalogPage,
} from "@/lib/catalog/search-params";
import { parseEnv } from "@/lib/env";
import { centsToDollars, dollarsToCents } from "@/lib/money";
import { makeOrderNumber } from "@/lib/orders/order-number";
import { checkoutSchema, pendingCheckoutMetadataSchema } from "@/lib/validators/cart";
import { orderInventoryStatusSchema } from "@/lib/validators/order";
import {
  pendingCheckoutInsertSchema,
  pendingCheckoutLineSnapshotsSchema,
} from "@/lib/validators/pending-checkout";
import { productInsertSchema, slugSchema } from "@/lib/validators/product";

const variantId = "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6";
const requestId = "a593031e-8306-46c9-b92d-caa1d274405d";

describe("checkout contract", () => {
  test("accepts variant IDs and quantities", () => {
    expect(
      checkoutSchema.parse({
        requestId,
        items: [{ variantId, quantity: 2 }],
      }),
    ).toEqual({
      requestId,
      items: [{ variantId, quantity: 2 }],
      // Omitted by clients that predate local pickup, so it defaults to shipping.
      fulfillmentMethod: "shipping",
    });
    expect(
      checkoutSchema.parse({
        requestId,
        items: [{ variantId, quantity: 2 }],
        fulfillmentMethod: "pickup",
      }).fulfillmentMethod,
    ).toBe("pickup");
    expect(() =>
      checkoutSchema.parse({
        requestId,
        items: [{ variantId, quantity: 2 }],
        fulfillmentMethod: "courier",
      }),
    ).toThrow();
  });

  test("rejects empty carts and invalid UUIDs", () => {
    expect(() => checkoutSchema.parse({ items: [] })).toThrow();
    expect(() => checkoutSchema.parse({ items: [{ variantId: "nope", quantity: 1 }] })).toThrow();
  });

  test("requires a UUID checkout request ID", () => {
    expect(checkoutSchema.safeParse({ items: [{ variantId, quantity: 1 }] }).success).toBe(false);
    expect(
      checkoutSchema.safeParse({
        requestId: "request-123",
        items: [{ variantId, quantity: 1 }],
      }).success,
    ).toBe(false);
  });

  test("accepts pending checkout token metadata", () => {
    expect(
      pendingCheckoutMetadataSchema.parse({
        pendingCheckoutToken: "checkout_abcDEF123456789",
      }),
    ).toEqual({
      pendingCheckoutToken: "checkout_abcDEF123456789",
    });
  });

  test("requires strict immutable line snapshots for new pending checkouts", () => {
    const lineItems = [
      {
        variantId,
        productName: "Database Deck",
        variantName: '8.25"',
        unitPriceCents: 8900,
        quantity: 1,
        currency: "cad",
      },
    ];

    expect(
      pendingCheckoutInsertSchema.parse({
        token: "checkout_abcDEF123456789",
        items: [{ variantId, quantity: 1 }],
        lineItems,
        expiresAt: new Date("2026-07-22T18:00:00.000Z"),
      }),
    ).toMatchObject({ items: [{ variantId, quantity: 1 }], lineItems });
    expect(
      pendingCheckoutInsertSchema.safeParse({
        token: "checkout_abcDEF123456789",
        items: [{ variantId, quantity: 1 }],
        expiresAt: new Date("2026-07-22T18:00:00.000Z"),
      }).success,
    ).toBe(false);
    expect(
      pendingCheckoutLineSnapshotsSchema.safeParse([
        ...lineItems,
        { ...lineItems[0], productName: "Duplicate" },
      ]).success,
    ).toBe(false);
    expect(
      pendingCheckoutLineSnapshotsSchema.safeParse([{ ...lineItems[0], currency: "CAD" }]).success,
    ).toBe(false);
  });
});

describe("environment contract", () => {
  test("defaults Stripe Tax on and accepts an explicit false flag", () => {
    expect(parseEnv({ NODE_ENV: "test" }).STRIPE_TAX_ENABLED).toBe(true);
    expect(parseEnv({ NODE_ENV: "test", STRIPE_TAX_ENABLED: "false" }).STRIPE_TAX_ENABLED).toBe(
      false,
    );
  });

  test("rejects invalid Stripe Tax flag values", () => {
    expect(() => parseEnv({ NODE_ENV: "test", STRIPE_TAX_ENABLED: "sometimes" })).toThrow();
  });

  test("requires a high-entropy cron secret when scheduled delivery is configured", () => {
    expect(parseEnv({ NODE_ENV: "test", CRON_SECRET: "test_cron_secret_123456" }).CRON_SECRET).toBe(
      "test_cron_secret_123456",
    );
    expect(() => parseEnv({ NODE_ENV: "test", CRON_SECRET: "too-short" })).toThrow();
  });
});

describe("cart selectors", () => {
  test("summarizes display lines and strips snapshots for checkout", () => {
    const lines = [
      {
        variantId,
        quantity: 2,
        productName: "Street Deck",
        variantName: '8.25"',
        priceCents: 8900,
        imageUrl: "https://example.com/deck.jpg",
      },
    ];

    expect(getCartItemCount(lines)).toBe(2);
    expect(getCartSubtotalCents(lines)).toBe(17800);
    expect(toCheckoutRequest(lines, requestId, "shipping")).toEqual({
      requestId,
      items: [{ variantId, quantity: 2 }],
      fulfillmentMethod: "shipping",
    });
  });
});

describe("product validators", () => {
  test("slug requires lowercase letters, numbers, and hyphens", () => {
    expect(slugSchema.parse("street-deck-825")).toBe("street-deck-825");
    expect(() => slugSchema.parse("Street Deck")).toThrow();
  });

  test("product insert derives a runtime schema from the Drizzle table", () => {
    expect(
      productInsertSchema.parse({
        slug: "street-deck",
        name: "Street Deck",
        description: null,
        category: "hardgoods",
        status: "active",
      }),
    ).toMatchObject({
      slug: "street-deck",
      name: "Street Deck",
      category: "hardgoods",
      status: "active",
    });
  });

  test("rejects legacy and unknown category values", () => {
    for (const category of ["decks", "apparel", "custom"]) {
      expect(
        productInsertSchema.safeParse({
          slug: "category-test",
          name: "Category Test",
          description: null,
          category,
          status: "draft",
        }).success,
      ).toBe(false);
    }
  });
});

describe("catalog category contract", () => {
  test("uses canonical labels and recognizes only supported legacy redirects", () => {
    expect(getCatalogHeading(null)).toBe("Shop All");
    expect(getCatalogHeading("hardgoods")).toBe("Hardgoods");
    expect(getCatalogHeading("softgoods")).toBe("Softgoods");
    expect(getCatalogHeading("accessories")).toBe("Accessories");
    expect(getProductCategoryLabel("hardgoods")).toBe("Hardgoods");
    expect(getProductCategoryLabel("softgoods")).toBe("Softgoods");
    expect(getProductCategoryLabel("accessories")).toBe("Accessories");
    expect(getProductCategoryLabel("decks")).toBe("Uncategorized");
    expect(getLegacyProductCategoryAlias(" Decks ")).toBe("hardgoods");
    expect(getLegacyProductCategoryAlias("apparel")).toBe("softgoods");
    expect(getLegacyProductCategoryAlias("accessories")).toBeNull();
  });

  test("canonicalizes a legacy category while preserving the other catalog state", async () => {
    const parsed = await catalogSearchParamsCache.parse({
      q: "street deck",
      category: "decks",
      sort: "name-asc",
      page: "2",
    });

    expect(parsed.category).toBeNull();
    expect(
      getCanonicalCatalogCategoryUrl(
        new URL("https://example.com/products?q=street+deck&category=decks&sort=name-asc&page=2"),
      )?.toString(),
    ).toBe("https://example.com/products?q=street+deck&category=hardgoods&sort=name-asc&page=2");
  });
});

describe("catalog subcategory contract", () => {
  test("maps the fixed taxonomy to its parent categories", () => {
    expect(getProductSubcategoryOptions("hardgoods").map(({ value }) => value)).toEqual([
      "decks",
      "trucks",
      "wheels",
      "bearings",
      "griptape",
      "hardware",
    ]);
    expect(getProductSubcategoryOptions("softgoods").map(({ value }) => value)).toEqual([
      "t-shirts",
      "hoodies",
      "jackets",
      "pants",
      "hats",
      "socks",
    ]);
    expect(getProductSubcategoryOptions("accessories").map(({ value }) => value)).toEqual([
      "stickers",
      "patches",
      "keychains",
      "buttons",
    ]);
    // Every canonical value appears in exactly one parent group.
    expect(productSubcategories.map(({ value }) => value).sort()).toEqual(
      [...productSubcategoryValues].sort(),
    );
    expect(new Set(productSubcategoryValues).size).toBe(productSubcategoryValues.length);
  });

  test("uses canonical labels and parent lookups", () => {
    expect(getProductSubcategoryLabel("t-shirts")).toBe("T-Shirts");
    expect(getProductSubcategoryLabel("griptape")).toBe("Griptape");
    expect(getProductSubcategoryLabel("skateboards")).toBe("Uncategorized");
    expect(getProductSubcategoryLabel(null)).toBe("Uncategorized");
    expect(getProductCategoryForSubcategory("decks")).toBe("hardgoods");
    expect(getProductCategoryForSubcategory("hats")).toBe("softgoods");
    expect(getProductCategoryForSubcategory("buttons")).toBe("accessories");
  });

  test("accepts only canonical parent-child pairs", () => {
    expect(isProductSubcategory("bearings")).toBe(true);
    expect(isProductSubcategory("bearing")).toBe(false);
    expect(isValidProductTaxonomyPair("hardgoods", "decks")).toBe(true);
    expect(isValidProductTaxonomyPair("softgoods", "jackets")).toBe(true);
    expect(isValidProductTaxonomyPair("accessories", "stickers")).toBe(true);
    expect(isValidProductTaxonomyPair("softgoods", "decks")).toBe(false);
    expect(isValidProductTaxonomyPair("hardgoods", "t-shirts")).toBe(false);
    expect(isValidProductTaxonomyPair("apparel", "t-shirts")).toBe(false);
    expect(isValidProductTaxonomyPair("hardgoods", "unknown")).toBe(false);
  });
});

describe("catalog filter URL contract", () => {
  test("notifies the server and resets pagination with each control update", () => {
    expect(catalogFilterUrlOptions).toEqual({ shallow: false });
    expect(withFirstCatalogPage({ q: "shirt" })).toEqual({ q: "shirt", page: 1 });
    expect(withFirstCatalogPage({ sort: "price-asc" })).toEqual({
      sort: "price-asc",
      page: 1,
    });
  });
});

describe("money helpers", () => {
  test("converts dollars and cents without persisted floats", () => {
    expect(dollarsToCents("128")).toBe(12800);
    expect(dollarsToCents("$1,234.50")).toBe(123450);
    expect(centsToDollars(3400)).toBe("34.00");
  });

  test("rejects invalid money input", () => {
    expect(() => dollarsToCents("12.345")).toThrow();
    expect(() => dollarsToCents("-1.00")).toThrow();
  });
});

describe("order numbers", () => {
  test("uses the v1 order number format", () => {
    const orderNumber = makeOrderNumber(new Date("2026-07-09T12:00:00.000Z"), "a1b2c3d4");

    expect(orderNumber).toBe("FHQ-20260709-A1B2C3D4");
  });
});

describe("order inventory contract", () => {
  test("accepts only explicit persisted allocation states", () => {
    expect(orderInventoryStatusSchema.parse("allocated")).toBe("allocated");
    expect(orderInventoryStatusSchema.parse("exception")).toBe("exception");
    expect(() => orderInventoryStatusSchema.parse("available")).toThrow();
  });
});
