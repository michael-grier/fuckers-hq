import { describe, expect, test } from "bun:test";

import {
  countProductsByStatus,
  filterAdminProducts,
  lowStockThreshold,
  summarizeProductStock,
} from "@/lib/admin/product-list";

function variant(name: string, inventoryQty: number, reservedQty = 0) {
  return { name, inventoryQty, reservedQty };
}

describe("summarizeProductStock", () => {
  test("subtracts reserved stock from available totals", () => {
    const summary = summarizeProductStock([variant("S", 10, 4), variant("M", 10, 1)]);

    expect(summary.totalAvailable).toBe(15);
    expect(summary.isOutOfStock).toBe(false);
    expect(summary.lowStockVariant).toBeNull();
  });

  test("reports the scarcest variant once it reaches the threshold", () => {
    const summary = summarizeProductStock([
      variant("S", 10),
      variant("M", lowStockThreshold + 1, 2),
      variant("L", 8),
    ]);

    expect(summary.lowStockVariant).toEqual({ name: "M", available: lowStockThreshold - 1 });
  });

  test("treats a fully reserved product as out of stock, not low stock", () => {
    const summary = summarizeProductStock([variant("S", 2, 2)]);

    expect(summary.isOutOfStock).toBe(true);
    expect(summary.lowStockVariant).toBeNull();
  });

  test("treats a product with no variants as out of stock", () => {
    expect(summarizeProductStock([])).toEqual({
      totalAvailable: 0,
      isOutOfStock: true,
      lowStockVariant: null,
    });
  });
});

const products = [
  { name: "Blank Deck", slug: "blank-deck", status: "active", variants: [{ name: '8.25"' }] },
  { name: "Fire Tee", slug: "fire-tee", status: "draft", variants: [{ name: "M" }, { name: "L" }] },
  { name: "Old Grip", slug: "old-grip", status: "archived", variants: [{ name: '9"' }] },
];

describe("filterAdminProducts", () => {
  test("filters by status", () => {
    expect(
      filterAdminProducts(products, { q: "", status: "draft" }).map((product) => product.slug),
    ).toEqual(["fire-tee"]);
  });

  test("matches name, slug, and variant name case-insensitively", () => {
    expect(filterAdminProducts(products, { q: "DECK", status: "all" })).toHaveLength(1);
    expect(filterAdminProducts(products, { q: "old-grip", status: "all" })).toHaveLength(1);
    expect(filterAdminProducts(products, { q: "l", status: "all" }).length).toBeGreaterThan(0);
  });

  test("combines status and query, and ignores surrounding whitespace", () => {
    expect(filterAdminProducts(products, { q: "  tee  ", status: "active" })).toHaveLength(0);
    expect(filterAdminProducts(products, { q: "  tee  ", status: "draft" })).toHaveLength(1);
  });

  test("returns everything when unfiltered", () => {
    expect(filterAdminProducts(products, { q: "", status: "all" })).toHaveLength(3);
  });
});

describe("countProductsByStatus", () => {
  test("counts each status plus an all total", () => {
    expect(countProductsByStatus(products)).toEqual({
      all: 3,
      active: 1,
      draft: 1,
      archived: 1,
    });
  });

  test("reports zero products as an empty all bucket", () => {
    expect(countProductsByStatus([])).toEqual({ all: 0 });
  });
});
