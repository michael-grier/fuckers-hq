import { describe, expect, test } from "bun:test";

import { getCartItemCount, getCartSubtotalCents, toCheckoutRequest } from "@/lib/cart/selectors";
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

describe("checkout contract", () => {
  test("accepts variant IDs and quantities", () => {
    expect(
      checkoutSchema.parse({
        items: [{ variantId, quantity: 2 }],
      }),
    ).toEqual({
      items: [{ variantId, quantity: 2 }],
    });
  });

  test("rejects empty carts and invalid UUIDs", () => {
    expect(() => checkoutSchema.parse({ items: [] })).toThrow();
    expect(() => checkoutSchema.parse({ items: [{ variantId: "nope", quantity: 1 }] })).toThrow();
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
    expect(toCheckoutRequest(lines)).toEqual({
      items: [{ variantId, quantity: 2 }],
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
        category: "decks",
        status: "active",
      }),
    ).toMatchObject({
      slug: "street-deck",
      name: "Street Deck",
      category: "decks",
      status: "active",
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

    expect(orderNumber).toBe("SK8-20260709-A1B2C3D4");
  });
});

describe("order inventory contract", () => {
  test("accepts only explicit persisted allocation states", () => {
    expect(orderInventoryStatusSchema.parse("allocated")).toBe("allocated");
    expect(orderInventoryStatusSchema.parse("exception")).toBe("exception");
    expect(() => orderInventoryStatusSchema.parse("available")).toThrow();
  });
});
