import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import { renderToStaticMarkup } from "react-dom/server";

import { CatalogFilters } from "@/components/shop/catalog-filters";
import type { ProductSubcategory } from "@/lib/catalog/categories";
import {
  toCatalogFilterUpdate,
  toggleStagedCategory,
  toggleStagedSubcategory,
} from "@/lib/catalog/filter-staging";

// What the current catalogue is filed under: a small slice of the much larger fixed taxonomy.
const populatedSubcategories: ProductSubcategory[] = ["decks", "t-shirts", "stickers", "magnets"];

function renderCatalogFilters(searchParams: string): string {
  return renderToStaticMarkup(
    <NuqsTestingAdapter searchParams={searchParams}>
      <CatalogFilters populatedSubcategories={populatedSubcategories} totalProducts={4} />
    </NuqsTestingAdapter>,
  );
}

/** Mounts the live filters and records every URL update Apply commits. */
function mountCatalogFilters(
  searchParams: string,
  populated = populatedSubcategories,
): UrlUpdateEvent[] {
  const updates: UrlUpdateEvent[] = [];

  render(
    <NuqsTestingAdapter onUrlUpdate={(event) => updates.push(event)} searchParams={searchParams}>
      <CatalogFilters populatedSubcategories={populated} totalProducts={4} />
    </NuqsTestingAdapter>,
  );

  return updates;
}

afterEach(cleanup);

describe("catalog filter popover accessibility", () => {
  test("exposes the open popover as a dialog named Filters", async () => {
    mountCatalogFilters("");

    // The content is portalled and mounts only once open, so the name has to be asserted
    // against the live DOM rather than server-rendered markup.
    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    // Queried by accessible name, so this fails if the label is dropped: Radix renders the
    // content as role="dialog", and the fieldset legends name only the groups inside it.
    const dialog = await screen.findByRole("dialog", { name: "Filters" });

    expect(dialog.getAttribute("aria-label")).toBe("Filters");
    expect(screen.getByRole("group", { name: "Categories" })).toBeDefined();
  });

  test("moves focus down and up the panel with the arrow keys", async () => {
    mountCatalogFilters("");

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    const dialog = await screen.findByRole("dialog", { name: "Filters" });
    const controls = [...dialog.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];

    controls[0].focus();

    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    expect(document.activeElement).toBe(controls[1]);

    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    expect(document.activeElement).toBe(controls[0]);

    // Wraps rather than dead-ending at either edge.
    fireEvent.keyDown(dialog, { key: "ArrowUp" });
    expect(document.activeElement).toBe(controls[controls.length - 1]);
  });

  test("swallows the arrow keys so the page behind the popover does not scroll", async () => {
    mountCatalogFilters("");

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));

    const dialog = await screen.findByRole("dialog", { name: "Filters" });

    // fireEvent returns false once a handler has called preventDefault; an unhandled arrow key
    // reaches the browser default, which is scrolling the document.
    expect(fireEvent.keyDown(dialog, { key: "ArrowDown" })).toBe(false);
    expect(fireEvent.keyDown(dialog, { key: "ArrowUp" })).toBe(false);
  });
});

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

describe("catalog filter subcategory availability", () => {
  test("offers only the subcategories the catalogue has products in", async () => {
    mountCatalogFilters("");

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    await screen.findByRole("dialog", { name: "Filters" });
    fireEvent.click(screen.getByLabelText("Hardgoods"));

    expect(screen.getByLabelText("Decks")).toBeDefined();
    // Nothing is filed under these, so checking one could only ever return an empty grid.
    expect(screen.queryByLabelText("Trucks")).toBeNull();
    expect(screen.queryByLabelText("Wheels")).toBeNull();
  });

  test("keeps an applied subcategory listed once its last product is gone", async () => {
    const updates = mountCatalogFilters("?categories=hardgoods&subcategories=trucks", ["decks"]);

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    await screen.findByRole("dialog", { name: "Filters" });

    // Otherwise the filter stays applied in the URL with no checkbox left to switch it off.
    expect(screen.getByLabelText("Trucks").getAttribute("aria-checked")).toBe("true");

    // Listing it is only half the fix; unchecking it has to actually leave the URL, or the
    // shopper stays pinned to an empty result set.
    fireEvent.click(screen.getByLabelText("Trucks"));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0].searchParams.getAll("subcategories")).toEqual([]);
    expect(updates[0].searchParams.getAll("categories")).toEqual(["hardgoods"]);
  });

  test("drops the subcategory group entirely when a scoped category has no products", async () => {
    mountCatalogFilters("?category=hardgoods", ["t-shirts"]);

    fireEvent.click(screen.getByRole("button", { name: /filters/i }));
    await screen.findByRole("dialog", { name: "Filters" });

    expect(screen.queryByRole("group", { name: "Subcategories" })).toBeNull();
    expect(screen.getByText("No filters available for this category.")).toBeDefined();
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

    // Delimited so the assertion reads the badge text: a bare "3" also matches utility classes
    // like gap-3 and focus-visible:ring-[3px], which would make this pass with no badge at all.
    expect(markup).toContain(">3<");
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
