import { describe, expect, test } from "bun:test";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";

import { CatalogFilters } from "@/components/shop/catalog-filters";
import {
  toCatalogFilterUpdate,
  toggleStagedCategory,
  toggleStagedSubcategory,
} from "@/lib/catalog/filter-staging";

function renderCatalogFilters(searchParams: string): string {
  return renderToStaticMarkup(
    <NuqsTestingAdapter searchParams={searchParams}>
      <CatalogFilters totalProducts={4} />
    </NuqsTestingAdapter>,
  );
}

describe("catalog filter staging", () => {
  test("selecting a category stages it once", () => {
    const empty = { categories: [], subcategories: [] };
    const once = toggleStagedCategory(empty, "hardgoods", true);
    const twice = toggleStagedCategory(once, "hardgoods", true);

    expect(once.categories).toEqual(["hardgoods"]);
    expect(twice.categories).toEqual(["hardgoods"]);
  });

  test("deselecting a parent clears its staged child selections only", () => {
    const staged = {
      categories: ["hardgoods", "softgoods"] as const,
      subcategories: ["decks", "trucks", "t-shirts"] as const,
    };

    const next = toggleStagedCategory(
      { categories: [...staged.categories], subcategories: [...staged.subcategories] },
      "hardgoods",
      false,
    );

    expect(next.categories).toEqual(["softgoods"]);
    expect(next.subcategories).toEqual(["t-shirts"]);
  });

  test("subcategory toggles stage and unstage a single value", () => {
    const staged = { categories: ["hardgoods" as const], subcategories: [] };
    const checked = toggleStagedSubcategory(staged, "decks", true);
    const unchecked = toggleStagedSubcategory(checked, "decks", false);

    expect(checked.subcategories).toEqual(["decks"]);
    expect(unchecked.subcategories).toEqual([]);
  });

  test("Apply on Shop All writes selections and removes empty parameters", () => {
    expect(
      toCatalogFilterUpdate(
        { categories: ["hardgoods"], subcategories: ["decks", "t-shirts"] },
        null,
      ),
    ).toEqual({
      categories: ["hardgoods"],
      // The t-shirts orphan is dropped because softgoods is not selected.
      subcategories: ["decks"],
    });
    expect(toCatalogFilterUpdate({ categories: [], subcategories: [] }, null)).toEqual({
      categories: null,
      subcategories: null,
    });
  });

  test("Apply on a scoped view never writes multi-category parameters", () => {
    expect(
      toCatalogFilterUpdate(
        { categories: ["softgoods"], subcategories: ["decks", "t-shirts"] },
        "hardgoods",
      ),
    ).toEqual({
      categories: null,
      subcategories: ["decks"],
    });
  });
});

describe("catalog filter popover trigger", () => {
  test("places the Filters button immediately before Sort", () => {
    const markup = renderCatalogFilters("");
    const filtersIndex = markup.indexOf("Filters");
    const sortIndex = markup.indexOf("Sort");

    expect(filtersIndex).toBeGreaterThan(-1);
    expect(sortIndex).toBeGreaterThan(filtersIndex);
  });

  test("shows no count badge without active selections", () => {
    expect(renderCatalogFilters("")).not.toContain("active filters");
  });

  test("counts applied categories and subcategories on Shop All", () => {
    const markup = renderCatalogFilters(
      "?categories=hardgoods&categories=softgoods&subcategories=decks",
    );

    expect(markup).toContain("3");
    expect(markup).toContain("active filters");
  });

  test("ignores the locked scope and foreign parameters in the count on scoped views", () => {
    const markup = renderCatalogFilters(
      "?category=hardgoods&categories=softgoods&subcategories=decks&subcategories=t-shirts",
    );

    // Only the in-scope decks selection counts: not the locked category, not the stray
    // multi-category parameter, and not the foreign t-shirts subcategory.
    expect(markup).toContain(">1<");
    expect(markup).toContain("active filters");
  });
});
