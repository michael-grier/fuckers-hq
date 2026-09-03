import { expect, type Page, test } from "@playwright/test";

import { addToCartFromPdp } from "../helpers/stripe";
import { type StripeRelay, startStripeRelay } from "../helpers/stripe-cli";

// The opt-in live tier: real hosted-Checkout payment with a sandbox test card relayed back by
// the Stripe CLI, and a real browser-to-R2 image upload. Run with `bun run test:e2e:live`.
// These specs talk to external services, so they are excluded from the deterministic gate.
const liveEnabled = process.env.E2E_STRIPE_LIVE === "1";
const runId = Date.now().toString(36);

/** Completes the shared customer and card fields on Stripe-hosted Checkout. */
async function fillHostedCheckout(page: Page, email: string, cardNumber: string) {
  await page.locator("#email").fill(email);
  await page.locator("#shippingName").fill("E2E Live Customer");
  await page.locator("#shippingAddressLine1").fill("123 Test Street");
  await page.locator("#shippingLocality").fill("Calgary");
  await page.locator("#shippingAdministrativeArea").selectOption("AB");
  await page.locator("#shippingPostalCode").fill("T1T 1T1");
  await page.locator("#cardNumber").fill(cardNumber);
  await page.locator("#cardExpiry").fill("12 / 34");
  await page.locator("#cardCvc").fill("123");
}

/** Approves the test issuer's sandbox challenge inside Stripe Checkout. */
async function authorizeThreeDSChallenge(page: Page) {
  await expect
    .poll(() => page.frames().some((frame) => frame.url().includes("testmode-acs.stripe.com")))
    .toBe(true);

  const challengeFrame = page
    .frames()
    .find((frame) => frame.url().includes("testmode-acs.stripe.com"));
  if (!challengeFrame) {
    throw new Error("Stripe's 3D Secure sandbox challenge did not open.");
  }

  const completeButton = challengeFrame.locator("#test-source-authorize-3ds");
  await expect(completeButton).toBeVisible();
  // Stripe disables the submitter synchronously, which can cancel the POST in headless Chromium.
  // Native form submission records the same sandbox approval without that browser-only race.
  await completeButton.evaluate((button) => (button as HTMLButtonElement).form?.submit());
}

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
    await fillHostedCheckout(page, email, "4242 4242 4242 4242");
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

  test("a 3D Secure challenge returns to the store and lands one paid order", async ({ page }) => {
    test.setTimeout(300_000);
    const email = `e2e-live-3ds-${runId}@example.com`;

    await addToCartFromPdp(page, "e2e-budget-bearings");
    await page.getByRole("dialog").getByRole("button", { name: "Checkout" }).click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });

    // Stripe documents this sandbox card as always requiring authentication.
    await fillHostedCheckout(page, email, "4000 0027 6000 3184");
    await page.locator("button[type=submit]").click();
    await authorizeThreeDSChallenge(page);

    await page.waitForURL(/\/order\/success/, { timeout: 120_000 });
    await expect(page.getByRole("button", { name: /^Cart/ })).toContainText("0");

    // The return page alone is not proof of durable payment handling; wait for the relayed webhook
    // to create exactly one paid order under the unique checkout email.
    await expect(async () => {
      await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
      await expect(page.getByRole("link", { name: /FHQ-/ })).toHaveCount(1, { timeout: 5_000 });
      await expect(page.getByText("Paid", { exact: true })).toHaveCount(1);
    }).toPass({ timeout: 60_000 });
  });
});

test.describe("live R2 image upload @stripe-live", () => {
  test.skip(!liveEnabled, "Opt-in tier: run with bun run test:e2e:live.");
  test.skip(
    !process.env.R2_BUCKET || !process.env.R2_ACCOUNT_ID,
    "R2 is not configured in this environment.",
  );

  test("new and existing product uploads reach R2 and render from the public URL", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const name = `E2E Live Upload ${runId}`;
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );

    await page.goto("/admin/products/new");
    await page.getByLabel("Name", { exact: true }).fill(name);
    await page.getByLabel("Category", { exact: true }).selectOption("hardgoods");
    await page.getByLabel("Subcategory").selectOption("decks");
    await page.getByLabel("Shipping profile").selectOption("deck");
    await page.getByLabel("Variant 1 name").fill("One");
    await page.getByLabel("Variant 1 SKU").fill(`E2E-LIVE-${runId}`);
    await page.getByLabel("Variant 1 price in dollars").fill("10.00");
    await page.getByLabel("Variant 1 on-hand inventory").fill("1");

    // A 1x1 PNG straight into the composer's file input; the browser PUTs it to R2 presigned.
    await page.locator('input[type="file"]').setInputFiles({
      name: "e2e-live.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });
    await expect(page.getByText("1 image uploaded")).toBeVisible({ timeout: 60_000 });

    await page.getByRole("button", { name: "Save as draft" }).click();
    await expect(page).toHaveURL(/\/admin\/products\/[0-9a-f-]+$/);
    // The workspace media panel serves the stored object back from the public R2 URL.
    await expect(page.getByRole("heading", { name: "Media" })).toBeVisible();
    await expect(page.getByText("1 image", { exact: true })).toBeVisible();
    // The count comes from state, not from a successful load — prove the object really serves
    // from the public R2 URL by requiring decoded pixels.
    const publicHost = new URL(process.env.R2_PUBLIC_URL ?? "").host;
    const storedImage = page.locator(`img[src*="${publicHost}"]`).first();
    await expect(storedImage).toBeVisible();
    await expect
      .poll(() => storedImage.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    // Existing products persist a valid selection immediately, without a second submit action.
    await page.getByLabel("Choose a product photo").setInputFiles({
      name: "e2e-live-existing.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });
    await expect(page.getByText("2 images", { exact: true })).toBeVisible({ timeout: 60_000 });

    // Clean up the draft and both images through the app's own delete path.
    await page.getByRole("button", { name: "Delete product" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/admin\/products$/);
  });
});
