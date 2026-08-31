import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CatalogPagination } from "@/components/shop/catalog-pagination";

const matchingProducts = Array.from({ length: 13 }, (_, index) => ({
  id: `product-${index + 1}`,
  slug: `deck-${index + 1}`,
  name: `Deck ${String(index + 1).padStart(2, "0")}`,
  description: "A catalog deck",
  category: "hardgoods",
  subcategory: "decks",
  status: "active" as const,
  createdAt: new Date(`2026-07-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
  updatedAt: new Date("2026-07-22T00:00:00.000Z"),
  variants: [
    {
      id: `variant-${index + 1}`,
      productId: `product-${index + 1}`,
      name: "Standard",
      sku: `DECK-${index + 1}`,
      priceCents: 8_900 + index,
      inventoryQty: 1,
      reservedQty: 0,
      createdAt: new Date("2026-07-22T00:00:00.000Z"),
      updatedAt: new Date("2026-07-22T00:00:00.000Z"),
    },
  ],
  images: [],
}));

mock.module("server-only", () => ({}));
mock.module("@/lib/db/client", () => ({
  getDb: () => ({
    query: {
      products: {
        findMany: async () => matchingProducts,
      },
    },
  }),
}));

const actualEnvModule = await import("@/lib/env");

// Catalog queries short-circuit without database configuration, so keep this test boundary
// explicit while preserving the module's other exports for tests that share Bun's module cache.
mock.module("@/lib/env", () => ({
  ...actualEnvModule,
  env: {
    ...actualEnvModule.env,
    DATABASE_URL: "postgres://catalog.test",
  },
}));

const { getCatalogPage } = await import("@/lib/catalog/queries");
const { catalogSearchParamsCache } = await import("@/lib/catalog/search-params");

const retainedFilters = {
  q: "deck",
  category: "hardgoods" as const,
  categories: [],
  subcategories: ["decks" as const],
  sort: "name-asc" as const,
};

function renderPagination(currentPage: number, totalPages: number): string {
  return renderToStaticMarkup(
    <CatalogPagination
      currentPage={currentPage}
      searchParams={retainedFilters}
      totalPages={totalPages}
    />,
  );
}

describe("catalog pagination", () => {
  test("renders forward navigation for more than one page and retains active filters", async () => {
    const catalog = await getCatalogPage({ ...retainedFilters, page: 1 });
    const markup = renderPagination(catalog.page, catalog.totalPages);

    expect(catalog.totalProducts).toBe(13);
    expect(catalog.products).toHaveLength(12);
    expect(catalog.totalPages).toBe(2);
    expect(markup).toContain("Page 1 of 2");
    expect(markup).toContain(
      'href="/products?q=deck&amp;category=hardgoods&amp;subcategories=decks&amp;sort=name-asc&amp;page=2"',
    );
    expect(markup).toContain('aria-label="Go to catalog page 2"');
    expect(markup).toContain('aria-disabled="true" disabled=""');
    expect(markup).not.toContain('aria-label="Go to catalog page 0"');
  });

  test("renders back navigation and clamps a stale page to the final page", async () => {
    const catalog = await getCatalogPage({ ...retainedFilters, page: 99 });
    const markup = renderPagination(catalog.page, catalog.totalPages);

    expect(catalog.page).toBe(2);
    expect(catalog.products).toHaveLength(1);
    expect(markup).toContain("Page 2 of 2");
    expect(markup).toContain(
      'href="/products?q=deck&amp;category=hardgoods&amp;subcategories=decks&amp;sort=name-asc&amp;page=1"',
    );
    expect(markup).toContain('aria-label="Go to catalog page 1"');
    expect(markup).toContain('aria-disabled="true" disabled=""');
    expect(markup).not.toContain('aria-label="Go to catalog page 3"');
  });

  test("falls back from an invalid page parameter and omits single-page navigation", async () => {
    const parsed = await catalogSearchParamsCache.parse({ page: "not-a-page" });
    const catalog = await getCatalogPage({ ...parsed, q: "Deck 01", category: "hardgoods" });

    expect(parsed.page).toBe(1);
    expect(catalog.page).toBe(1);
    expect(catalog.totalProducts).toBe(1);
    expect(renderPagination(catalog.page, catalog.totalPages)).toBe("");
  });

  test("serializes repeated multi-select parameters into page links", () => {
    const markup = renderToStaticMarkup(
      <CatalogPagination
        currentPage={1}
        searchParams={{
          q: "",
          category: null,
          categories: ["hardgoods", "softgoods"],
          subcategories: ["decks", "t-shirts"],
          sort: "newest",
        }}
        totalPages={3}
      />,
    );

    expect(markup).toContain(
      "categories=hardgoods&amp;categories=softgoods&amp;subcategories=decks&amp;subcategories=t-shirts",
    );
  });

  test("excludes products outside the taxonomy filter before paginating", async () => {
    const catalog = await getCatalogPage({
      q: "",
      category: null,
      categories: ["softgoods"],
      subcategories: [],
      sort: "newest",
      page: 1,
    });

    expect(catalog.totalProducts).toBe(0);
    expect(catalog.totalPages).toBe(1);
    // The filter panel is built from this list, so narrowing the grid — here to nothing — must
    // not remove the checkboxes that would widen it again.
    expect(catalog.populatedSubcategories).toEqual(["decks"]);
  });
});
