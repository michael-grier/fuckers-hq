import { expect, test } from "@playwright/test";

// The database may hold catalog rows beyond the seeds (worktree Neon branches inherit their
// parent branch's data), so specs assert against searches that pin a deterministic result set —
// the seeded names, or the q=e2e fixture products — never against the full grid.

// Uncaught page errors fail the spec; console noise (e.g. a blocked remote placeholder image)
// does not, so the suite stays deterministic without network access to image hosts.
function failOnPageError(page: import("@playwright/test").Page): void {
  page.on("pageerror", (error) => {
    throw new Error(`Uncaught page error: ${error.message}`);
  });
}

test.describe("storefront @smoke", () => {
  test("home page renders with header navigation and cart trigger", async ({ page }) => {
    failOnPageError(page);
    await page.goto("/");
    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Cart/ })).toBeVisible();
  });

  test("the catalog serves each seeded product", async ({ page }) => {
    failOnPageError(page);
    for (const name of ["Street Deck 8.25", "Canvas Coach Jacket", "Precision Bearings"]) {
      await page.goto(`/products?q=${encodeURIComponent(name)}`);
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
  });

  test("search narrows the catalog and lands in the URL", async ({ page }) => {
    await page.goto("/products");
    // Input before hydration is silently lost; retry the action-and-outcome pair (the config
    // runs with retries: 0 on purpose).
    await expect(async () => {
      await page.getByLabel("Search products").fill("canvas coach");
      await expect(page).toHaveURL(/q=canvas\+coach/, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Canvas Coach Jacket" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Street Deck 8.25" })).not.toBeVisible();
  });

  test("price sorting reorders the filtered grid and lands in the URL", async ({ page }) => {
    await page.goto("/products?q=e2e");
    // Same hydration-race guard as the search spec.
    await expect(async () => {
      await page.getByLabel("Sort").selectOption("price-asc");
      await expect(page).toHaveURL(/sort=price-asc/, { timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await expect(page.locator("article h2").first()).toHaveText("E2E Budget Bearings");
    // The reverse order arrives via URL params, proving the sort state is URL-driven.
    await page.goto("/products?q=e2e&sort=price-desc");
    await expect(page.locator("article h2").first()).toHaveText("E2E Sold Out Deck");
  });

  test("legacy category URLs redirect to their canonical category and keep other params", async ({
    page,
  }) => {
    await page.goto("/products?category=decks&sort=price-asc");
    await expect(page).toHaveURL(/category=hardgoods/);
    await expect(page).toHaveURL(/sort=price-asc/);
  });

  test("a sold-out product is labeled out of stock in the catalog", async ({ page }) => {
    await page.goto("/products?q=e2e+sold+out");
    await expect(page.getByText("Out of stock")).toBeVisible();
  });

  test("an unknown product slug shows the not-found page", async ({ page }) => {
    await page.goto("/products/this-slug-does-not-exist");
    await expect(page.getByText("404")).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to shop" })).toBeVisible();
  });
});

test.describe("product page @smoke", () => {
  test("shows the product with its variants and price", async ({ page }) => {
    failOnPageError(page);
    await page.goto("/products/street-deck-825");
    await expect(page.getByRole("heading", { name: "Street Deck 8.25", level: 1 })).toBeVisible();
    // The first in-stock variant is preselected; switching variants must update the price.
    await expect(page.getByText("$89.00")).toBeVisible();
    await expect(async () => {
      await page.getByRole("button", { name: '8.5"' }).click();
      await expect(page.getByText("$92.00")).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: '8.25"' }).click();
    await expect(page.getByText("$89.00")).toBeVisible();
    await expect(page.getByText("Quantity", { exact: true })).toBeVisible();
    await expect(page.getByText("12 available")).not.toBeVisible();
    await expect(page.getByText("Only 12 left")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeEnabled();
  });

  test("shows the count only for the selected low-stock variant", async ({ page }) => {
    await page.goto("/products/canvas-coach-jacket");
    await expect(page.getByText("Only 3 left")).not.toBeVisible();
    await page.getByRole("button", { name: "XL" }).click();
    await expect(page.getByText("Only 3 left")).toBeVisible();
    await page.getByRole("button", { name: "Medium" }).click();
    await expect(page.getByText("Only 3 left")).not.toBeVisible();
  });

  test("a sold-out product cannot be added to the cart", async ({ page }) => {
    await page.goto("/products/e2e-sold-out-deck");
    await expect(page.getByText("Out of stock", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Add to cart" })).toBeDisabled();
  });
});
