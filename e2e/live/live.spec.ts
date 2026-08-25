import { expect, test } from "@playwright/test";

import { addToCartFromPdp } from "../helpers/stripe";
import { type StripeRelay, startStripeRelay } from "../helpers/stripe-cli";

// The opt-in live tier: real hosted-Checkout payment with a sandbox test card relayed back by
// the Stripe CLI, and a real browser-to-R2 image upload. Run with `bun run test:e2e:live`.
// These specs talk to external services, so they are excluded from the deterministic gate.
const liveEnabled = process.env.E2E_STRIPE_LIVE === "1";
const runId = Date.now().toString(36);

test.describe("live Stripe checkout @stripe-live", () => {
  test.skip(!liveEnabled, "Opt-in tier: run with bun run test:e2e:live.");

  let relay: StripeRelay;
  test.beforeAll(async () => {
    relay = await startStripeRelay();
  });
  test.afterAll(() => relay?.stop());

  test("a real card payment lands the order and clears the cart", async ({ page }) => {
    test.setTimeout(300_000);
    const email = `e2e-live-${runId}@example.com`;

    await addToCartFromPdp(page, "street-deck-825");
    await page.getByRole("dialog").getByRole("button", { name: "Checkout" }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });

    // Stripe's hosted payment page. With shipping-address collection on, the form is the
    // shipping-scoped variant and billing defaults to "same as shipping".
    await page.locator("#email").fill(email);
    await page.locator("#shippingName").fill("E2E Live Customer");
    await page.locator("#shippingAddressLine1").fill("123 Test Street");
    await page.locator("#shippingLocality").fill("Calgary");
    await page.locator("#shippingAdministrativeArea").selectOption("AB");
    await page.locator("#shippingPostalCode").fill("T1T 1T1");
    await page.locator("#cardNumber").fill("4242 4242 4242 4242");
    await page.locator("#cardExpiry").fill("12 / 34");
    await page.locator("#cardCvc").fill("123");
    await page.locator("button[type=submit]").click();

    // Payment redirects to the success page, which only clears the cart for a paid session.
    await page.waitForURL(/\/order\/success/, { timeout: 120_000 });
    await expect(page.getByRole("button", { name: /^Cart/ })).toContainText("0");

    // The relayed real webhook persisted exactly one paid order.
    await expect(async () => {
      await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
      await expect(page.getByRole("link", { name: /FHQ-/ })).toHaveCount(1, { timeout: 5_000 });
    }).toPass({ timeout: 60_000 });
  });
});

test.describe("live R2 image upload @stripe-live", () => {
  test.skip(!liveEnabled, "Opt-in tier: run with bun run test:e2e:live.");
  test.skip(
    !process.env.R2_BUCKET || !process.env.R2_ACCOUNT_ID,
    "R2 is not configured in this environment.",
  );

  test("a browser upload reaches R2 and renders from the public URL", async ({ page }) => {
    test.setTimeout(120_000);
    const name = `E2E Live Upload ${runId}`;

    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Category", { exact: true }).selectOption("hardgoods");
    await page.getByLabel("Subcategory").selectOption("decks");
    await page.getByLabel("Variant 1 name").fill("One");
    await page.getByLabel("Variant 1 SKU").fill(`E2E-LIVE-${runId}`);
    await page.getByLabel("Variant 1 price in dollars").fill("10.00");
    await page.getByLabel("Variant 1 on-hand inventory").fill("1");

    // A 1x1 PNG straight into the composer's file input; the browser PUTs it to R2 presigned.
    await page.locator('input[type="file"]').setInputFiles({
      name: "e2e-live.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(page.getByText("1 image uploaded")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
    // The workspace media panel serves the stored object back from the public R2 URL.
    await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();
    await expect(page.getByText("1 image", { exact: true })).toBeVisible();

    // Clean up the draft (and its image, via the app's own delete path).
    await page.getByRole("button", { name: "Delete product" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
  });
});
