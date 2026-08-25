import { expect, type Page, test } from "@playwright/test";

import {
  addToCartFromPdp,
  buildSignedCheckoutEvent,
  getSessionTokens,
  postWebhook,
  readCartVariantId,
  startCheckoutFromCart,
} from "../helpers/stripe";

// All commerce specs live in one file and the commerce project is not fully parallel: they
// assert shared inventory numbers through the admin UI, and interleaved reservations would
// make those assertions ambiguous. Each spec still uses its own product and its own unique
// customer email, so an interrupted run cannot poison the next one.
const runId = Date.now().toString(36);

/**
 * The workspace row for a SKU. Variant display order is not the seed order (positions tie),
 * so rows are resolved by SKU instead of index.
 */
async function variantRow(page: Page, sku: string) {
  const count = await page.getByLabel(/^Variant \d+ SKU$/).count();
  for (let index = 1; index <= count; index++) {
    if ((await page.getByLabel(`Variant ${index} SKU`).inputValue()) === sku) {
      return {
        onHand: page.getByLabel(`Variant ${index} on-hand inventory`),
        row: page.locator("tr").filter({ has: page.getByLabel(`Variant ${index} SKU`) }),
      };
    }
  }
  throw new Error(`No variant row with SKU ${sku}`);
}

/** Opens the admin workspace for a product via the products list search. */
async function openWorkspace(page: Page, productName: string): Promise<void> {
  await page.goto(`/admin/products?q=${encodeURIComponent(productName)}`);
  await page.getByRole("link", { name: productName }).click();
  await expect(page.getByRole("heading", { name: productName, level: 1 })).toBeVisible();
}

test.describe("checkout boundary @commerce", () => {
  test("client price tampering cannot change what Stripe is asked to charge", async ({ page }) => {
    await addToCartFromPdp(page, "street-deck-825");
    // Corrupt the persisted cart's price the way a hostile client could.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem("fuckers-hq-cart");
      if (!raw) throw new Error("cart not persisted");
      const parsed = JSON.parse(raw);
      parsed.state.lines[0].priceCents = 1;
      window.localStorage.setItem("fuckers-hq-cart", JSON.stringify(parsed));
    });
    await page.reload();
    await page.getByRole("button", { name: /^Cart/ }).click();

    const sessionId = await startCheckoutFromCart(page);
    // The session was priced from the database snapshot, not the tampered cart.
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    expect(session.amount_subtotal).toBe(8_900);

    // Starting checkout reserved the unit without touching on-hand stock.
    await openWorkspace(page, "Street Deck 8.25");
    const deck = await variantRow(page, "DECK-STREET-825");
    // Reservations from earlier runs may still be inside their TTL, so assert presence, not
    // count; the invariant is that on-hand stock never moves at reservation time.
    await expect(deck.row.getByText(/reserved/)).toBeVisible();
    await expect(deck.onHand).toHaveValue("12");
  });

  test("the checkout schema rejects client-supplied prices outright", async ({ page }) => {
    await addToCartFromPdp(page, "e2e-budget-bearings");
    const variantId = await readCartVariantId(page);
    const response = await page.request.post("/api/checkout", {
      data: {
        requestId: crypto.randomUUID(),
        items: [{ variantId, quantity: 1, priceCents: 1 }],
      },
    });
    expect(response.status()).toBe(400);
  });

  test("the same requestId converges on one checkout session", async ({ page }) => {
    await addToCartFromPdp(page, "e2e-budget-bearings");
    const variantId = await readCartVariantId(page);
    const body = { requestId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] };
    const first = await page.request.post("/api/checkout", { data: body });
    const second = await page.request.post("/api/checkout", { data: body });
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect((await second.json()).url).toBe((await first.json()).url);
  });
});

test.describe("paid-order webhook @commerce", () => {
  test("a signed paid event creates exactly one order, once, with inventory converted", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `e2e-paid-${runId}@example.com`;

    await addToCartFromPdp(page, "canvas-coach-jacket", "Medium");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);
    const event = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId,
      tokens,
      subtotalCents: 12_800,
      email,
    });

    expect(await postWebhook(page.request, event)).toBe(200);

    // The order is visible in admin with its persisted snapshots and a confirmation record.
    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    const orderRow = page.getByRole("link", { name: /FHQ-/ });
    await expect(orderRow).toHaveCount(1);
    await orderRow.click();
    await page.getByRole("link", { name: "Open full order" }).click();
    await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("cell", { name: "Canvas Coach Jacket" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Confirmation email" })).toBeVisible();
    // Delivery is durable either way: sent, or parked for the retry cron.
    await expect(page.getByText(/Sent|Retry scheduled/).first()).toBeVisible();

    // Replaying the identical signed bytes is acknowledged without a second order.
    expect(await postWebhook(page.request, event)).toBe(200);
    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await expect(page.getByRole("link", { name: /FHQ-/ })).toHaveCount(1);

    // Conversion decremented on-hand and returned this row's reservation to zero (Medium
    // seeds at 5, and each run reseeds inventory).
    await openWorkspace(page, "Canvas Coach Jacket");
    const medium = await variantRow(page, "JACKET-CANVAS-M");
    await expect(medium.onHand).toHaveValue("4");
    await expect(medium.row.getByText(/reserved/)).toBeHidden();
  });

  test("an unpaid completion holds stock until the async payment fails", async ({ page }) => {
    test.setTimeout(120_000);
    await addToCartFromPdp(page, "canvas-coach-jacket", "XL");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);
    const email = `e2e-async-${runId}@example.com`;

    // Delayed payment method: completed arrives unpaid, so no order — the hold stays.
    const unpaid = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId,
      tokens,
      subtotalCents: 12_800,
      email,
      paymentStatus: "unpaid",
    });
    expect(await postWebhook(page.request, unpaid)).toBe(200);
    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await expect(
      page.getByRole("heading", { name: "No orders match these filters" }),
    ).toBeVisible();
    await openWorkspace(page, "Canvas Coach Jacket");
    const xlHeld = await variantRow(page, "JACKET-CANVAS-XL");
    await expect(xlHeld.row.getByText(/reserved/)).toBeVisible();

    // The terminal failure releases the reservation exactly once; on-hand is untouched.
    const failed = buildSignedCheckoutEvent("checkout.session.async_payment_failed", {
      sessionId,
      tokens,
      subtotalCents: 12_800,
      email,
    });
    expect(await postWebhook(page.request, failed)).toBe(200);
    expect(await postWebhook(page.request, failed)).toBe(200);
    await openWorkspace(page, "Canvas Coach Jacket");
    const xl = await variantRow(page, "JACKET-CANVAS-XL");
    await expect(xl.row.getByText(/reserved/)).toBeHidden();
    await expect(xl.onHand).toHaveValue("3");
  });

  test("an expired session releases its reservation", async ({ page }) => {
    test.setTimeout(120_000);
    await addToCartFromPdp(page, "canvas-coach-jacket", "Large");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);

    const expired = buildSignedCheckoutEvent("checkout.session.expired", {
      sessionId,
      tokens,
      subtotalCents: 12_800,
      email: `e2e-expired-${runId}@example.com`,
    });
    expect(await postWebhook(page.request, expired)).toBe(200);
    await openWorkspace(page, "Canvas Coach Jacket");
    const large = await variantRow(page, "JACKET-CANVAS-L");
    await expect(large.row.getByText(/reserved/)).toBeHidden();
    await expect(large.onHand).toHaveValue("6");
  });

  test("a tampered signature is rejected with no side effects", async ({ page }) => {
    const forged = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId: "cs_test_forged",
      tokens: {
        pendingCheckoutToken: "e2e-forged-pending-token",
        reservationToken: "e2e-forged-reservation",
      },
      subtotalCents: 8_900,
      email: `e2e-forged-${runId}@example.com`,
    });
    expect(await postWebhook(page.request, forged, "t=1,v1=deadbeef")).toBe(400);
    await page.goto(`/admin/orders?q=${encodeURIComponent(`e2e-forged-${runId}@example.com`)}`);
    await expect(
      page.getByRole("heading", { name: "No orders match these filters" }),
    ).toBeVisible();
  });
});

test.describe("fulfillment @commerce", () => {
  test("a paid shipping order can be marked shipped exactly once", async ({ page }) => {
    test.setTimeout(120_000);
    const email = `e2e-ship-${runId}@example.com`;

    await addToCartFromPdp(page, "precision-bearings");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);
    const event = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId,
      tokens,
      subtotalCents: 3_400,
      email,
    });
    expect(await postWebhook(page.request, event)).toBe(200);

    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /FHQ-/ }).click();
    await page.getByRole("link", { name: "Open full order" }).click();

    await page.getByRole("button", { name: "Mark as shipped" }).click();
    // Carrier defaults to "No tracking number", which is a valid hand-off.
    await page.getByRole("button", { name: "Ship and notify" }).click();
    await expect(page.getByText("Shipped", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeHidden();
  });

  test("a paid delivery order moves through the delivery queue", async ({ page }) => {
    test.skip(
      process.env.DELIVERY_ENABLED !== "true" || !process.env.DELIVERY_AREA_NAME,
      "Local delivery is not configured in this environment.",
    );
    test.setTimeout(120_000);
    const email = `e2e-deliver-${runId}@example.com`;

    await addToCartFromPdp(page, "e2e-budget-bearings");
    const variantId = await readCartVariantId(page);
    const response = await page.request.post("/api/checkout", {
      data: {
        requestId: crypto.randomUUID(),
        items: [{ variantId, quantity: 1 }],
        fulfillmentMethod: "delivery",
      },
    });
    expect(response.status()).toBe(200);
    const sessionId = ((await response.json()).url as string).match(/cs_test_[A-Za-z0-9]+/)?.[0];
    if (!sessionId) throw new Error("checkout response url had no session id");
    const tokens = await getSessionTokens(sessionId);
    const event = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId,
      tokens,
      subtotalCents: 500,
      email,
    });
    expect(await postWebhook(page.request, event)).toBe(200);

    // The paid delivery order enters the queue; scheduling then delivering completes it.
    await page.goto("/admin/deliveries");
    const scheduleRow = page.getByRole("row").filter({ hasText: email });
    await scheduleRow.getByRole("button", { name: "Schedule delivery" }).click();
    await page.getByRole("button", { name: "Yes, schedule" }).click();
    await expect(
      page.getByRole("row").filter({ hasText: email }).getByRole("button", {
        name: "Mark as delivered",
      }),
    ).toBeVisible();
    await page
      .getByRole("row")
      .filter({ hasText: email })
      .getByRole("button", { name: "Mark as delivered" })
      .click();
    await page.getByRole("button", { name: "Yes, delivered" }).click();
    await expect(page.getByRole("row").filter({ hasText: email })).toBeHidden();
  });
});
