import { expect, test } from "@playwright/test";

// While the cart sheet is open the page behind it is hidden from the accessibility tree, so
// header assertions (like the cart count badge) only run after closing the sheet with Escape.
// The add button reads "Added to cart" for a moment after a click, hence the /Add(ed)?/ name.

/** Adds the first variant of the Street Deck product and waits for the cart sheet to open. */
async function addStreetDeckToCart(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/products/street-deck-825");
  // A click landing before React hydrates is silently lost, so retry the action-and-outcome
  // pair rather than allowing test-level retries (the config runs with retries: 0 on purpose).
  await expect(async () => {
    await page.getByRole("button", { name: /^Add(ed)? to cart$/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** Closes the cart sheet and waits for it to be gone, so header assertions can see the page. */
async function closeCartSheet(page: import("@playwright/test").Page): Promise<void> {
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
}

test.describe("cart @smoke", () => {
  test("adding a product opens the cart with the item and updates the header count", async ({
    page,
  }) => {
    await addStreetDeckToCart(page);
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: /Street Deck 8\.25/ })).toBeVisible();
    await expect(dialog.getByText("1 item.")).toBeVisible();
    await closeCartSheet(page);
    await expect(page.getByRole("button", { name: /^Cart/ })).toContainText("1");
  });

  test("adding the same variant again merges the line instead of duplicating it", async ({
    page,
  }) => {
    await addStreetDeckToCart(page);
    await closeCartSheet(page);
    await page.getByRole("button", { name: /^Add(ed)? to cart$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("2 items.")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: /Street Deck 8\.25/ })).toHaveCount(1);
  });

  test("the cart survives a page reload", async ({ page }) => {
    await addStreetDeckToCart(page);
    await page.reload();
    await expect(page.getByRole("button", { name: /^Cart/ })).toContainText("1");
  });

  test("clearing the cart shows the empty state", async ({ page }) => {
    await addStreetDeckToCart(page);
    await page.getByRole("button", { name: "Clear cart" }).click();
    await expect(page.getByText("Ready when you are.")).toBeVisible();
    await closeCartSheet(page);
    await expect(page.getByRole("button", { name: /^Cart/ })).toContainText("0");
  });

  test("view cart navigates to the cart page with the persisted item", async ({ page }) => {
    await addStreetDeckToCart(page);
    // No lost-event retry here: the add-to-cart click already proved the page is hydrated, and
    // the sheet closes on this click, so the link only exists for one attempt. The navigation
    // itself can sit behind an on-demand dev-server compile of /cart, hence the patient timeout.
    await page.getByRole("dialog").getByRole("link", { name: "View cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("heading", { name: /Street Deck 8\.25/ })).toBeVisible();
  });

  test("the mobile delivery form stays collapsed until requested and collapses after success", async ({
    page,
  }) => {
    test.skip(
      process.env.DELIVERY_ENABLED !== "true" ||
        !process.env.DELIVERY_AREA_NAME ||
        !process.env.DELIVERY_ELIGIBILITY_SECRET,
      "Local delivery is not configured in this environment.",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/delivery/eligibility", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          status: "eligible",
          token: "e2e-signed-delivery-token",
          address: { line1: "262075 Rocky View Point", postalCode: "T4A0X2" },
          reviewRequired: false,
          message: "Free local delivery is available for this address.",
        }),
      });
    });
    await addStreetDeckToCart(page);
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByText("Check free local delivery")).toBeVisible();
    await expect(dialog.getByLabel("Street address")).toBeHidden();
    await expect(dialog.getByRole("button", { name: "Checkout" })).toBeInViewport();

    await dialog.getByText("Check free local delivery").click();
    await dialog.getByLabel("Street address").fill("262075 Rocky View Point");
    await dialog.getByLabel("Postal code").fill("T4A 0X2");
    await dialog.getByRole("button", { name: "Check address" }).click();

    await expect(dialog.getByText("Free local delivery available")).toBeVisible();
    await expect(dialog.getByRole("radio", { name: "Local delivery" })).toBeChecked();
    await expect(dialog.getByLabel("Street address")).toBeHidden();
  });
});
