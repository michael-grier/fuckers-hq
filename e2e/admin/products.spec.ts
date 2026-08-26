import { expect, type Page, test } from "@playwright/test";

// Each run works on its own uniquely named product, so leftovers from an interrupted run can
// never collide with the next one (slugs and SKUs are globally unique).
const runId = Date.now().toString(36);
const productName = `E2E Composer Deck ${runId}`;
const productSlug = `e2e-composer-deck-${runId}`;

test.describe("admin product lifecycle @admin", () => {
  test("keeps the product creation controls inside the mobile save bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin/products/new");

    const saveBar = page.getByText("Nothing is public until you publish.").locator("..");
    const controls = saveBar.getByRole("link", { name: "Cancel" }).or(saveBar.getByRole("button"));

    const [barBox, controlBoxes] = await Promise.all([
      saveBar.boundingBox(),
      controls.evaluateAll((elements) =>
        elements.map((element) => {
          const { left, right } = element.getBoundingClientRect();
          return { left, right };
        }),
      ),
    ]);

    expect(barBox).not.toBeNull();
    expect(controlBoxes).toHaveLength(3);

    if (barBox) {
      // The bar uses 16px horizontal padding; allow one pixel for border rounding.
      expect(Math.min(...controlBoxes.map(({ left }) => left)) - barBox.x).toBeGreaterThanOrEqual(
        15,
      );
      expect(
        barBox.x + barBox.width - Math.max(...controlBoxes.map(({ right }) => right)),
      ).toBeGreaterThanOrEqual(15);
    }
  });

  test("composer validation surfaces zod errors inline", async ({ page }) => {
    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill("E2E Validation Probe");
    await page.getByLabel("Slug").fill("Bad Slug!");
    await page.getByLabel("Variant 1 name").fill("One");
    await page.getByLabel("Variant 1 SKU").fill(`E2E-VAL-${runId}`);
    await page.getByLabel("Variant 1 price in dollars").fill("10.00");
    await page.getByLabel("Variant 1 on-hand inventory").fill("1");
    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page.getByText("Use lowercase letters, numbers, and hyphens.")).toBeVisible();
    await expect(page.getByText("Choose Hardgoods, Softgoods, or Accessories.")).toBeVisible();
    // Nothing was created; the composer is still on the new-product page.
    await expect(page).toHaveURL(/\/admin\/products\/new/);
  });

  test("create, publish, edit, archive, and delete a product end to end", async ({ page }) => {
    // One long journey on one product: the later steps depend on the earlier ones, and DB
    // constraints (unique slug/SKU) make splitting it into parallel specs racy.
    test.setTimeout(120_000);

    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill(productName);
    await page.getByLabel("Slug").fill(productSlug);
    await page.getByLabel("Category", { exact: true }).selectOption("hardgoods");
    await page.getByLabel("Subcategory").selectOption("decks");
    await page.getByLabel("Shipping profile").selectOption("deck");
    await page.getByLabel("Variant 1 name").fill('8.25"');
    await page.getByLabel("Variant 1 SKU").fill(`E2E-CD-${runId}`);
    await page.getByLabel("Variant 1 price in dollars").fill("79.00");
    await page.getByLabel("Variant 1 on-hand inventory").fill("4");
    await page.getByRole("button", { name: "Create & publish" }).click();

    // Publishing lands on the product workspace.
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
    await expect(page.getByRole("heading", { name: productName, level: 1 })).toBeVisible();
    await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();

    // The published product is live on the storefront, server-resolved from the database.
    await page.goto(`/products/${productSlug}`);
    await expect(page.getByRole("heading", { name: productName, level: 1 })).toBeVisible();
    await expect(page.getByText("$79.00")).toBeVisible();
    await page.goBack();

    // Edit: renaming dirties the form, which mounts the sticky save bar.
    const renamed = `${productName} v2`;
    await page.getByLabel("Name", { exact: true }).fill(renamed);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Product saved.");
    await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible();

    // Add a second variant and save it.
    await page.getByRole("button", { name: "Add variant" }).click();
    await page.getByLabel("Variant 2 name").fill('8.5"');
    await page.getByLabel("Variant 2 SKU").fill(`E2E-CD2-${runId}`);
    await page.getByLabel("Variant 2 price in dollars").fill("82.00");
    await page.getByLabel("Variant 2 on-hand inventory").fill("2");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Product saved.").first()).toBeVisible();
    await expect(page.getByLabel("Variant 2 SKU")).toHaveValue(`E2E-CD2-${runId}`);

    // Archive (allowed while active) via the inline confirm strip.
    await page.getByRole("button", { name: "Archive product" }).click();
    await page.getByRole("button", { name: "Yes, archive" }).click();
    await expect(page.getByText("Product archived.").first()).toBeVisible();

    // Archived products leave the storefront.
    await page.goto(`/products/${productSlug}`);
    await expect(page.getByText("404")).toBeVisible();
    await page.goBack();

    // Delete a saved variant (permitted now that the product is not active).
    await deleteRow(page, "Delete", 'Delete 8.5"?');
    await expect(page.getByLabel("Variant 2 SKU")).toBeHidden();
    // Removing the row dirties the form, and the danger zone refuses to act on unsaved changes.
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Product saved.").first()).toBeVisible();

    // Delete the product itself; success returns to the products list.
    await page.getByRole("button", { name: "Delete product" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
    await page.goto(`/admin/products?q=${encodeURIComponent(renamed)}`);
    await expect(
      page.getByRole("heading", { name: "No products match these filters" }),
    ).toBeVisible();
  });
});

/** Clicks the last inline Delete trigger, then its confirm button once the strip appears. */
async function deleteRow(page: Page, trigger: string, confirmText: string): Promise<void> {
  await page.getByRole("button", { name: trigger, exact: true }).last().click();
  await expect(page.getByText(confirmText)).toBeVisible();
  await page.getByRole("button", { name: "Yes, delete" }).click();
}
