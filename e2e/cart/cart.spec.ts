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
    // the sheet closes on this click, so the link only exists for one attempt. Production
    // navigation can finish before the close animation, so wait for both outcomes explicitly.
    await page.getByRole("dialog").getByRole("link", { name: "View cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("main").getByRole("heading", { name: /Street Deck 8\.25/ }),
    ).toBeVisible();
  });

  test("local delivery requires the address-review agreement in the sidebar and cart page", async ({
    page,
  }) => {
    test.skip(
      process.env.DELIVERY_ENABLED !== "true" || !process.env.DELIVERY_AREA_NAME,
      "Local delivery is not configured in this environment.",
    );

    await addStreetDeckToCart(page);
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Local delivery", { exact: true }).click();

    await expect(dialog.getByText("Address review required")).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Agree above to checkout" })).toBeDisabled();

    await dialog
      .getByRole("checkbox", { name: /I understand that my address will be reviewed/ })
      .click();
    await expect(dialog.getByRole("button", { name: "Checkout" })).toBeEnabled();

    await dialog.getByRole("link", { name: "View cart" }).click();
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByText("Address review required")).toBeVisible();
    await expect(
      page.getByRole("checkbox", { name: /I understand that my address will be reviewed/ }),
    ).toHaveAttribute("data-state", "checked");
  });
});
