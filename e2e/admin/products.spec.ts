import { expect, type Page, test } from "@playwright/test";
import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";

// Each run works on its own uniquely named product, so leftovers from an interrupted run can
// never collide with the next one (slugs and SKUs are globally unique).
const runId = Date.now().toString(36);
const productName = `E2E Composer Deck ${runId}`;
const productSlug = `e2e-composer-deck-${runId}`;

test.describe("admin product lifecycle @admin", () => {
  test("counts every variant that needs stock on the product card", async ({ page }) => {
    await page.goto(`/admin/products?q=${encodeURIComponent("E2E Budget Bearings")}`);

    await expect(page.getByText("2 variants need stock", { exact: true })).toBeVisible();
    await expect(page.getByText("Ceramic: 0 left", { exact: true })).toHaveCount(0);
  });

  test("hides pristine creation controls and uses one compact mobile action row", async ({
    page,
  }) => {
    for (const { width, height } of [
      { width: 320, height: 844 },
      { width: 375, height: 844 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 768, height: 844 },
      { width: 1366, height: 844 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/admin/products/new");

      const saveBar = page.getByRole("region", { name: "Product creation controls" });
      await expect(saveBar).toHaveCount(0);

      const name = page.getByLabel("Name", { exact: true });
      await name.fill(`Layout probe ${width}`);
      await expect(saveBar).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);

      const controls = saveBar.locator("a:visible, button:visible");

      const [barBox, controlBoxes] = await Promise.all([
        saveBar.boundingBox(),
        controls.evaluateAll((elements) =>
          elements.map((element) => {
            const { left, right, top } = element.getBoundingClientRect();
            return { left, right, top };
          }),
        ),
      ]);

      expect(barBox).not.toBeNull();
      expect(controlBoxes).toHaveLength(width < 640 ? 2 : 3);

      if (barBox) {
        // The bar uses 16px horizontal padding; allow one pixel for border rounding.
        expect(Math.min(...controlBoxes.map(({ left }) => left)) - barBox.x).toBeGreaterThanOrEqual(
          15,
        );
        expect(
          barBox.x + barBox.width - Math.max(...controlBoxes.map(({ right }) => right)),
        ).toBeGreaterThanOrEqual(15);
      }

      if (width < 640) {
        expect(barBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(64);
        expect(barBox?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((barBox?.x ?? Number.POSITIVE_INFINITY) + (barBox?.width ?? 0)).toBeLessThanOrEqual(
          width,
        );
        expect(barBox?.y ?? -1).toBeGreaterThanOrEqual(0);
        expect((barBox?.y ?? Number.POSITIVE_INFINITY) + (barBox?.height ?? 0)).toBeLessThanOrEqual(
          height,
        );
        expect(controlBoxes[0]?.top).toBe(controlBoxes[1]?.top);
        await expect(saveBar.getByRole("link", { name: "Cancel" })).toBeHidden();
        await expect(saveBar.getByText("Nothing is public until you publish.")).toBeHidden();
      }

      if (width >= 768) {
        expect(Math.max(...controlBoxes.map(({ top }) => top))).toBe(
          Math.min(...controlBoxes.map(({ top }) => top)),
        );
      }
    }
  });

  test("tolerates a password-manager mutation before hydration", async ({ page }) => {
    const hydrationErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error" && message.text().includes("hydrated")) {
        hydrationErrors.push(message.text());
      }
    });
    await page.addInitScript(() => {
      const observer = new MutationObserver(() => {
        const mainColumn = document.querySelector(
          "form[data-protonpass-ignore] > .grid > .min-w-0.space-y-4",
        );

        if (mainColumn) {
          mainColumn.setAttribute("data-protonpass-form", "");
          observer.disconnect();
        }
      });
      observer.observe(document, { childList: true, subtree: true });
    });

    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/admin/products/new");
    await expect(page.locator("form[data-protonpass-ignore]")).toHaveCount(1);

    await page.getByLabel("Name", { exact: true }).fill("Hydration probe");
    const saveBar = page.getByRole("region", { name: "Product creation controls" });
    await expect(saveBar).toBeVisible();

    const barBox = await saveBar.boundingBox();
    expect((barBox?.y ?? Number.POSITIVE_INFINITY) + (barBox?.height ?? 0)).toBeLessThanOrEqual(
      932,
    );
    expect(hydrationErrors).toEqual([]);
  });

  test("shows creation controls when a staged image is the only edit", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/api/admin/upload-url", async (route) => {
      const uploadRequest: unknown = route.request().postDataJSON();

      if (
        typeof uploadRequest !== "object" ||
        uploadRequest === null ||
        !("productId" in uploadRequest) ||
        typeof uploadRequest.productId !== "string"
      ) {
        throw new Error("Expected a product-scoped image upload request.");
      }

      const uploadUrl = new URL("/api/admin/test-upload", route.request().url()).toString();
      await route.fulfill({
        json: {
          uploadUrl,
          objectKey: `products/${uploadRequest.productId}/20000000-0000-4000-8000-000000000002-deck.jpg`,
          publicUrl: new URL("/test-product-image.jpg", uploadUrl).toString(),
        },
      });
    });
    await page.route("**/api/admin/test-upload", async (route) => {
      await route.fulfill({ status: 200 });
    });
    await page.goto("/admin/products/new");

    const saveBar = page.getByRole("region", { name: "Product creation controls" });
    await expect(saveBar).toHaveCount(0);

    await page.getByLabel("Choose a product photo").setInputFiles({
      name: "deck.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    });

    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
    await expect(page.getByLabel("Alt text for deck.jpg")).toBeVisible();
    await expect(saveBar).toBeVisible();
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

  test("offers Magnets as an accessories subcategory", async ({ page }) => {
    await page.goto("/admin/products/new");
    const category = page.getByLabel("Category", { exact: true });
    const subcategory = page.getByLabel("Subcategory");
    // A selection before hydration is silently lost, so retry the action and its enabled outcome.
    await expect(async () => {
      await category.selectOption("accessories");
      await expect(subcategory).toBeEnabled();
    }).toPass({ timeout: 30_000 });

    await subcategory.selectOption("magnets");
    await expect(subcategory).toHaveValue("magnets");
  });

  test("uses the unified image picker on existing products", async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`/admin/products?q=${encodeURIComponent("Precision Bearings")}`);
    // A click before hydration is silently lost, so retry the action-and-outcome pair.
    await expect(async () => {
      await page.getByRole("link", { name: "Precision Bearings", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Precision Bearings", level: 1 })).toBeVisible(
        { timeout: 5_000 },
      );
    }).toPass({ timeout: 30_000 });

    const media = page.getByRole("region", { name: "Media" });
    const pickerInput = media.getByLabel("Choose a product photo");
    const pickerCard = pickerInput.locator("..");
    const imageCard = media.locator("[data-reorder-key]").first();

    await expect(pickerInput).toHaveAttribute("type", "file");
    await expect(media.getByText("Choose photo")).toBeVisible();
    await expect(media.getByText("Image file", { exact: true })).toHaveCount(0);
    await expect(media.getByRole("button", { name: "Add image" })).toHaveCount(0);

    for (const width of [768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      const [imageBox, pickerBox] = await Promise.all([
        imageCard.boundingBox(),
        pickerCard.boundingBox(),
      ]);

      expect(imageBox).not.toBeNull();
      expect(pickerBox).not.toBeNull();
      // Allow one pixel for fractional grid-track rounding.
      expect(Math.abs((imageBox?.height ?? 0) - (pickerBox?.height ?? 0))).toBeLessThanOrEqual(1);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    const [mobileImageBox, mobilePickerBox] = await Promise.all([
      imageCard.boundingBox(),
      pickerCard.boundingBox(),
    ]);
    expect(mobileImageBox).not.toBeNull();
    expect(mobilePickerBox).not.toBeNull();
    expect(mobilePickerBox?.y ?? 0).toBeGreaterThanOrEqual(
      (mobileImageBox?.y ?? 0) + (mobileImageBox?.height ?? 0),
    );
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
    // A pre-hydration click is silently lost. Wait for the server-action response so the retry
    // stops before it could submit the same unique slug and SKU twice.
    await expect(async () => {
      await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/admin/products/new" &&
            response.request().method() === "POST" &&
            response.ok(),
          { timeout: 5_000 },
        ),
        page.getByRole("button", { name: "Create & publish" }).click(),
      ]);
    }).toPass({ timeout: 30_000 });

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
    const saveBar = page.getByRole("region", { name: "Product save controls" });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Product saved.").first()).toBeVisible();
    await expect(saveBar).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
    await page.reload();
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

    // Delete the product itself, then verify it is gone from the products list.
    const productPath = new URL(page.url()).pathname;
    const productId = productPath.split("/").at(-1);

    if (!productId) {
      throw new Error(`Product workspace URL has no product id: ${productPath}`);
    }

    await page.getByRole("button", { name: "Delete product" }).click();
    const deletionCompleted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === productPath &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await deletionCompleted;
    // A Next server-action stream can remain open after its transaction commits. The durable
    // record is the stable completion boundary for this destructive workflow.
    await expect
      .poll(
        () =>
          getDb().query.products.findFirst({
            columns: { id: true },
            where: eq(products.id, productId),
          }),
        { timeout: 30_000 },
      )
      .toBeUndefined();
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
