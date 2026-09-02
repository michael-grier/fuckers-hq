import { expect, type Page, test } from "@playwright/test";
import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { orderEmailDeliveries, orders } from "@/lib/db/schema";

import {
  addToCartFromPdp,
  buildSignedCheckoutEvent,
  buildSignedRefundEvent,
  buildSignedShippingPaymentEvent,
  getSessionTokens,
  getShippingPaymentTokens,
  postWebhook,
  readCartVariantId,
  resilientPost,
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

async function readOrderNeedsActionCount(page: Page) {
  const ordersLink = page
    .getByRole("navigation", { name: "Admin navigation" })
    .getByRole("link", { name: /^Orders/ });
  const badge = ordersLink.getByLabel(/orders? needs? action/);

  return (await badge.count()) === 0 ? 0 : Number(await badge.textContent());
}

/** Opens the admin workspace for a product via the products list search. */
async function openWorkspace(page: Page, productName: string): Promise<void> {
  await page.goto(`/admin/products?q=${encodeURIComponent(productName)}`);
  // A click before hydration is silently lost, so retry the action-and-outcome pair.
  await expect(async () => {
    await page.getByRole("link", { name: productName }).click();
    await expect(page.getByRole("heading", { name: productName, level: 1 })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 30_000 });
}

/** Opens the selected order through the peek link's rendered destination. */
async function openFullOrder(page: Page, linkName: "Open full order" | "Review full order") {
  const link = page.getByRole("link", { name: linkName });
  const href = await link.getAttribute("href");

  if (!href || !/^\/admin\/orders\/[0-9a-f-]+$/.test(href)) {
    throw new Error(`${linkName} has an invalid destination: ${href}`);
  }
  // The peek itself arrives through a streamed search-param refresh. Navigating its semantic href
  // avoids racing a second client transition while keeping the workflow under test unchanged.
  await page.goto(href);
  await expect(page).toHaveURL(/\/admin\/orders\/[0-9a-f-]+$/);
}

/** Opens the client-only shipping form once the detail page has hydrated. */
async function openShipmentForm(page: Page): Promise<void> {
  const submit = page.getByRole("button", { name: "Ship and notify" });

  if (await submit.isVisible()) {
    return;
  }

  await expect(async () => {
    await page.getByRole("button", { name: "Mark as shipped" }).click();
    await expect(submit).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

/** Ships the current order after the client form survives hydration. */
async function shipOrder(page: Page, trackingNumber?: string): Promise<void> {
  const orderPath = new URL(page.url()).pathname;
  const orderId = orderPath.split("/").at(-1);
  const shipped = page.getByText("Shipped", { exact: true }).first();

  if (!orderId) {
    throw new Error(`Order detail URL has no order id: ${orderPath}`);
  }

  await page.waitForLoadState("networkidle");
  await openShipmentForm(page);

  if (trackingNumber) {
    await page.getByLabel("Carrier").selectOption("canada_post");
    await page.getByLabel("Tracking number").fill(trackingNumber);
  }
  await page.getByRole("button", { name: "Ship and notify" }).click();

  // The action sends email after committing. Observe the durable transition instead of waiting on
  // that streamed response, which can remain open while the provider attempt completes.
  await expect
    .poll(
      () =>
        getDb().query.orders.findFirst({
          columns: { status: true, trackingCarrier: true, trackingNumber: true },
          where: eq(orders.id, orderId),
        }),
      { timeout: 30_000 },
    )
    .toEqual({
      status: "fulfilled",
      trackingCarrier: trackingNumber ? "canada_post" : null,
      trackingNumber: trackingNumber ?? null,
    });

  // Reload after persistence so the final assertion does not race the action's router refresh.
  await page.reload();
  await expect(shipped).toBeVisible();
  if (trackingNumber) {
    await expect(page.getByText(trackingNumber)).toBeVisible();
  }
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
    const tokens = await getSessionTokens(sessionId);
    try {
      // The session was priced from the database snapshot, not the tampered cart.
      const { default: Stripe } = await import("stripe");
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      expect(session.amount_subtotal).toBe(8_900);

      // Starting checkout reserved the unit without touching on-hand stock.
      await openWorkspace(page, "Street Deck 8.25");
      const deck = await variantRow(page, "DECK-STREET-825");
      // A crashed earlier run can leave a hold inside its TTL, so assert presence, not count;
      // the invariant is that on-hand stock never moves at reservation time.
      await expect(deck.row.getByText(/reserved/)).toBeVisible();
      await expect(deck.onHand).toHaveValue("12");
    } finally {
      // Release the hold so repeated runs cannot bleed the seeded stock dry: nothing else
      // expires reservations locally (no Stripe forwarding, no reconciliation cron).
      await postWebhook(
        page.request,
        buildSignedCheckoutEvent("checkout.session.expired", {
          sessionId,
          tokens,
          subtotalCents: 8_900,
          email: `e2e-tamper-${runId}@example.com`,
        }),
      );
    }
  });

  test("the checkout schema rejects client-supplied prices outright", async ({ page }) => {
    await addToCartFromPdp(page, "e2e-budget-bearings");
    const variantId = await readCartVariantId(page);
    const response = await resilientPost(page.request, "/api/checkout", {
      data: {
        requestId: crypto.randomUUID(),
        items: [{ variantId, quantity: 1, priceCents: 1 }],
      },
    });
    expect(response.status()).toBe(400);
  });

  test("delivery checkout rejects a missing acknowledgement and a subtotal below $30", async ({
    page,
  }) => {
    test.skip(
      process.env.DELIVERY_ENABLED !== "true" || !process.env.DELIVERY_AREA_NAME,
      "Local delivery is not configured in this environment.",
    );

    await addToCartFromPdp(page, "street-deck-825");
    const deckVariantId = await readCartVariantId(page);
    const missingAcknowledgement = await resilientPost(page.request, "/api/checkout", {
      data: {
        requestId: crypto.randomUUID(),
        items: [{ variantId: deckVariantId, quantity: 1 }],
        fulfillmentMethod: "delivery",
      },
    });
    expect(missingAcknowledgement.status()).toBe(400);

    await page.evaluate(() => window.localStorage.removeItem("fuckers-hq-cart"));
    await page.reload();
    await addToCartFromPdp(page, "e2e-budget-bearings");
    const budgetVariantId = await readCartVariantId(page);
    const belowMinimum = await resilientPost(page.request, "/api/checkout", {
      data: {
        requestId: crypto.randomUUID(),
        items: [{ variantId: budgetVariantId, quantity: 1 }],
        fulfillmentMethod: "delivery",
        deliveryAddressReviewAcknowledged: true,
      },
    });
    expect(belowMinimum.status()).toBe(400);
  });

  test("the same requestId converges on one checkout session", async ({ page }) => {
    await addToCartFromPdp(page, "e2e-budget-bearings");
    const variantId = await readCartVariantId(page);
    const body = { requestId: crypto.randomUUID(), items: [{ variantId, quantity: 1 }] };
    const first = await resilientPost(page.request, "/api/checkout", { data: body });
    const second = await resilientPost(page.request, "/api/checkout", { data: body });
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    const url = (await first.json()).url as string;
    expect((await second.json()).url).toBe(url);

    // Release the converged reservation (see the tampering spec for why cleanup matters).
    const sessionId = url.match(/cs_test_[A-Za-z0-9]+/)?.[0];
    if (!sessionId) throw new Error(`checkout URL had no session id: ${url}`);
    const tokens = await getSessionTokens(sessionId);
    await postWebhook(
      page.request,
      buildSignedCheckoutEvent("checkout.session.expired", {
        sessionId,
        tokens,
        subtotalCents: 500,
        email: `e2e-requestid-${runId}@example.com`,
      }),
    );
  });
});

test.describe("paid-order webhook @commerce", () => {
  test("an admin review converts an out-of-area delivery after supplemental payment", async ({
    page,
  }) => {
    test.skip(
      process.env.DELIVERY_ENABLED !== "true" || !process.env.DELIVERY_AREA_NAME,
      "Local delivery is not configured in this environment.",
    );
    test.setTimeout(120_000);
    const email = `e2e-delivery-review-${runId}@example.com`;

    await addToCartFromPdp(page, "street-deck-825");
    const cart = page.getByRole("dialog");
    await cart.getByText("Local delivery", { exact: true }).click();
    await cart
      .getByRole("checkbox", { name: /I understand that my address will be reviewed/ })
      .click();
    const originalSessionId = await startCheckoutFromCart(page);
    const originalTokens = await getSessionTokens(originalSessionId);
    const originalPayment = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId: originalSessionId,
      tokens: originalTokens,
      subtotalCents: 8_900,
      shippingCents: 0,
      email,
    });
    expect(await postWebhook(page.request, originalPayment)).toBe(200);

    await page.goto(`/admin/orders?filter=needs-action&q=${encodeURIComponent(email)}`);
    const orderRow = page.getByRole("link", { name: /FHQ-/ });
    await expect(orderRow).toHaveCount(1);
    await expect(orderRow.getByText("Address review", { exact: true })).toBeVisible();
    await orderRow.click();
    await expect(page.getByText("Address review required", { exact: true })).toBeVisible();
    await openFullOrder(page, "Review full order");
    const orderPath = new URL(page.url()).pathname;

    await expect(page.getByRole("heading", { name: "Review this delivery address" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Check address in Google Maps/ })).toBeVisible();
    await page.getByRole("button", { name: "Request shipping payment" }).click();
    const shippingRequestCompleted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === orderPath &&
        response.request().method() === "POST" &&
        response.ok(),
      { timeout: 60_000 },
    );
    await page.getByRole("button", { name: "Create and email link" }).click();
    await shippingRequestCompleted;
    await expect(page.getByRole("status")).toContainText("Shipping payment link ready");
    // Read the committed request and Checkout URL after the client has handled the action response.
    await page.reload();

    await expect(page.getByRole("heading", { name: "Waiting for shipping payment" })).toBeVisible({
      timeout: 30_000,
    });
    const checkoutUrl = await page
      .getByRole("link", { name: /Open payment link/ })
      .getAttribute("href");
    const shippingSessionId = checkoutUrl?.match(/cs_test_[A-Za-z0-9]+/)?.[0];

    if (!shippingSessionId) {
      throw new Error(`Shipping payment URL had no Session id: ${checkoutUrl}`);
    }

    const shippingTokens = await getShippingPaymentTokens(shippingSessionId);
    const shippingPayment = buildSignedShippingPaymentEvent({
      eventId: `evt_e2e_shipping_payment_${runId}`,
      sessionId: shippingSessionId,
      ...shippingTokens,
      email,
    });
    expect(await postWebhook(page.request, shippingPayment)).toBe(200);
    expect(await postWebhook(page.request, shippingPayment)).toBe(200);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Shipping payment received" })).toBeVisible();
    await expect(page.getByText("Original subtotal", { exact: true })).toBeVisible();
    await expect(page.getByText("Supplemental shipping paid", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeVisible();

    await page.goto(`/admin/orders?filter=to-ship&q=${encodeURIComponent(email)}`);
    await expect(page.getByRole("link", { name: /FHQ-/ })).toHaveCount(1);
    await openWorkspace(page, "Street Deck 8.25");
    await expect((await variantRow(page, "DECK-STREET-825")).onHand).toHaveValue("11");
  });

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
      province: "SK",
    });

    expect(await postWebhook(page.request, event)).toBe(200);

    const persistedOrder = await getDb().query.orders.findFirst({
      columns: { destinationProvince: true },
      where: eq(orders.email, email),
    });
    expect(persistedOrder?.destinationProvince).toBe("SK");

    // The order is visible in admin with its persisted snapshots and a confirmation record.
    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    const orderRow = page.getByRole("link", { name: /FHQ-/ });
    await expect(orderRow).toHaveCount(1);
    await orderRow.click();
    await openFullOrder(page, "Open full order");
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
        fulfillmentMethod: "shipping",
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

test.describe("refund inventory @commerce", () => {
  test("advancing refunds queue distinct notices and restore stock once when full", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `e2e-refund-auto-${runId}@example.com`;

    await openWorkspace(page, "E2E Budget Bearings");
    const beforeCheckout = await variantRow(page, "E2E-BEARINGS-BUDGET");
    const initialStock = await beforeCheckout.onHand.inputValue();

    await addToCartFromPdp(page, "e2e-budget-bearings");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);
    expect(
      await postWebhook(
        page.request,
        buildSignedCheckoutEvent("checkout.session.completed", {
          sessionId,
          tokens,
          subtotalCents: 500,
          email,
        }),
      ),
    ).toBe(200);

    const partialRefund = buildSignedRefundEvent({
      eventId: `evt_e2e_refund_partial_${runId}`,
      refundedCents: 500,
      tokens,
    });
    const fullRefund = buildSignedRefundEvent({
      eventId: `evt_e2e_refund_full_${runId}`,
      refundedCents: 2_000,
      tokens,
    });
    expect(await postWebhook(page.request, partialRefund)).toBe(200);
    expect(await postWebhook(page.request, fullRefund)).toBe(200);
    // Neither an exact replay nor a new stale event can add stock or queue another notice.
    expect(await postWebhook(page.request, fullRefund)).toBe(200);
    expect(
      await postWebhook(
        page.request,
        buildSignedRefundEvent({
          eventId: `evt_e2e_refund_stale_${runId}`,
          refundedCents: 500,
          tokens,
        }),
      ),
    ).toBe(200);

    const order = await getDb().query.orders.findFirst({
      columns: { id: true },
      where: eq(orders.email, email),
    });
    const refundDeliveries = await getDb().query.orderEmailDeliveries.findMany({
      columns: { refundAmountCents: true, refundCumulativeCents: true },
      where: and(
        eq(orderEmailDeliveries.orderId, order?.id ?? ""),
        eq(orderEmailDeliveries.kind, "refund"),
      ),
      orderBy: (deliveries) => [asc(deliveries.refundCumulativeCents)],
    });
    expect(refundDeliveries).toEqual([
      { refundAmountCents: 500, refundCumulativeCents: 500 },
      { refundAmountCents: 1500, refundCumulativeCents: 2000 },
    ]);

    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /FHQ-/ }).click();
    await openFullOrder(page, "Open full order");
    await expect(page.getByRole("heading", { name: "Refund email #1" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Refund email #2" })).toBeVisible();
    await expect(page.getByText("Returned to stock", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stock action required" })).toBeHidden();

    await openWorkspace(page, "E2E Budget Bearings");
    await expect((await variantRow(page, "E2E-BEARINGS-BUDGET")).onHand).toHaveValue(initialStock);
  });

  test("a refund retained before order creation queues its notice with the paid order", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `e2e-refund-early-${runId}@example.com`;

    await addToCartFromPdp(page, "e2e-budget-bearings");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);
    expect(
      await postWebhook(
        page.request,
        buildSignedRefundEvent({
          eventId: `evt_e2e_refund_early_${runId}`,
          refundedCents: 2_000,
          tokens,
        }),
      ),
    ).toBe(200);
    expect(
      await postWebhook(
        page.request,
        buildSignedCheckoutEvent("checkout.session.completed", {
          sessionId,
          tokens,
          subtotalCents: 500,
          email,
        }),
      ),
    ).toBe(200);

    const order = await getDb().query.orders.findFirst({
      columns: { id: true },
      where: eq(orders.email, email),
    });
    const deliveries = await getDb().query.orderEmailDeliveries.findMany({
      columns: { kind: true, refundAmountCents: true, refundCumulativeCents: true },
      where: eq(orderEmailDeliveries.orderId, order?.id ?? ""),
      orderBy: (deliveries) => [asc(deliveries.kind)],
    });
    expect(deliveries).toEqual([
      { kind: "confirmation", refundAmountCents: null, refundCumulativeCents: null },
      { kind: "refund", refundAmountCents: 2000, refundCumulativeCents: 2000 },
    ]);

    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /FHQ-/ }).click();
    await openFullOrder(page, "Open full order");
    await expect(page.getByRole("heading", { name: "Refund email #1" })).toBeVisible();
  });

  test("a refund after shipment stays visible until an operator returns the stock", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const email = `e2e-refund-manual-${runId}@example.com`;

    await openWorkspace(page, "Precision Bearings");
    const beforeCheckout = await variantRow(page, "BEARINGS-PRECISION-8");
    const initialStock = Number(await beforeCheckout.onHand.inputValue());

    await addToCartFromPdp(page, "precision-bearings");
    const sessionId = await startCheckoutFromCart(page);
    const tokens = await getSessionTokens(sessionId);
    expect(
      await postWebhook(
        page.request,
        buildSignedCheckoutEvent("checkout.session.completed", {
          sessionId,
          tokens,
          subtotalCents: 3_400,
          email,
        }),
      ),
    ).toBe(200);

    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /FHQ-/ }).click();
    await openFullOrder(page, "Open full order");
    const initialNeedsActionCount = await readOrderNeedsActionCount(page);
    await shipOrder(page);

    expect(
      await postWebhook(
        page.request,
        buildSignedRefundEvent({
          eventId: `evt_e2e_refund_manual_${runId}`,
          refundedCents: 4_900,
          tokens,
        }),
      ),
    ).toBe(200);
    await page.reload();

    await expect(page.getByRole("heading", { name: "Stock action required" })).toBeVisible();
    await expect(page.getByText("Restock required", { exact: true })).toBeVisible();
    await expect.poll(() => readOrderNeedsActionCount(page)).toBe(initialNeedsActionCount + 1);

    const orderPath = new URL(page.url()).pathname;
    let releaseRefresh = () => {};
    const refreshGate = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });
    let reportRefreshStarted = () => {};
    const refreshStarted = new Promise<void>((resolve) => {
      reportRefreshStarted = resolve;
    });
    let holdNextOrderGet = true;
    await page.route(
      (url) => url.pathname === orderPath,
      async (route) => {
        if (holdNextOrderGet && route.request().method() === "GET") {
          holdNextOrderGet = false;
          reportRefreshStarted();
          await refreshGate;
        }
        await route.continue();
      },
    );

    await page.getByRole("button", { name: "Return 1 unit to stock" }).click();
    const actionCompleted = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === orderPath &&
        response.request().method() === "POST" &&
        response.ok(),
    );
    await page.getByRole("button", { name: "Yes, return to stock" }).click();
    await actionCompleted;
    await refreshStarted;
    try {
      const pendingReturn = page.getByRole("button", { name: "Returning…" });
      await expect(pendingReturn).toBeDisabled();
      await expect(page.getByRole("button", { name: "Return 1 unit to stock" })).toBeHidden();
    } finally {
      releaseRefresh();
    }

    await expect(page.getByText("Returned to stock", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Stock action required" })).toBeHidden();
    await expect.poll(() => readOrderNeedsActionCount(page)).toBe(initialNeedsActionCount);

    await openWorkspace(page, "Precision Bearings");
    await expect((await variantRow(page, "BEARINGS-PRECISION-8")).onHand).toHaveValue(
      initialStock.toString(),
    );
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
      shippingCents: 0,
      email,
    });
    expect(await postWebhook(page.request, event)).toBe(200);

    await page.goto(`/admin/orders?q=${encodeURIComponent(email)}`);
    await page.getByRole("link", { name: /FHQ-/ }).click();
    await openFullOrder(page, "Open full order");

    await openShipmentForm(page);
    await page.getByLabel("Carrier").selectOption("canada_post");
    await page.getByLabel("Tracking number").fill("CX473124828CA");
    await page.getByRole("button", { name: "Ship and notify" }).click();
    await expect(
      page.getByText(
        "Enter a 16-digit Canada Post tracking number or a 13-character number with 2 letters, 9 digits, and CA.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Tracking number")).toHaveAttribute("aria-invalid", "true");

    await shipOrder(page, "CX473124829CA");
    await expect(page.getByRole("button", { name: "Mark as shipped" })).toBeHidden();
  });

  test("a paid delivery order moves through the delivery queue", async ({ page }) => {
    test.skip(
      process.env.DELIVERY_ENABLED !== "true" || !process.env.DELIVERY_AREA_NAME,
      "Local delivery is not configured in this environment.",
    );
    test.setTimeout(120_000);
    const email = `e2e-deliver-${runId}@example.com`;

    await addToCartFromPdp(page, "precision-bearings");
    const variantId = await readCartVariantId(page);
    const response = await resilientPost(page.request, "/api/checkout", {
      data: {
        requestId: crypto.randomUUID(),
        items: [{ variantId, quantity: 1 }],
        fulfillmentMethod: "delivery",
        deliveryAddressReviewAcknowledged: true,
      },
    });
    expect(response.status()).toBe(200);
    const sessionId = ((await response.json()).url as string).match(/cs_test_[A-Za-z0-9]+/)?.[0];
    if (!sessionId) throw new Error("checkout response url had no session id");
    const tokens = await getSessionTokens(sessionId);
    const event = buildSignedCheckoutEvent("checkout.session.completed", {
      sessionId,
      tokens,
      subtotalCents: 3_400,
      email,
    });
    expect(await postWebhook(page.request, event)).toBe(200);
    const readOrderState = () =>
      getDb().query.orders.findFirst({
        columns: { deliveryReviewStatus: true, status: true },
        where: eq(orders.email, email),
      });

    // Paid local orders stay out of the delivery queue until an admin approves the address.
    await page.goto(`/admin/orders?filter=needs-action&q=${encodeURIComponent(email)}`);
    const reviewOrder = page.getByRole("link", { name: /FHQ-/ });
    await expect(reviewOrder).toHaveCount(1);
    await reviewOrder.click();
    await openFullOrder(page, "Review full order");
    await page.getByRole("button", { name: "Approve local delivery" }).click();
    await page.getByRole("button", { name: "Yes, approve" }).click();
    await expect
      .poll(async () => (await readOrderState())?.deliveryReviewStatus, { timeout: 15_000 })
      .toBe("approved");
    // Reload only after persistence, rather than racing the server action's streamed response.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Local delivery approved" })).toBeVisible();

    // Once approved, scheduling and delivering the order completes it.
    await page.goto("/admin/deliveries");
    const scheduleRow = page.getByRole("row").filter({ hasText: email });
    await scheduleRow.getByRole("button", { name: "Schedule delivery" }).click();
    await page.getByRole("button", { name: "Yes, schedule" }).click();
    await expect
      .poll(async () => (await readOrderState())?.status, { timeout: 15_000 })
      .toBe("delivery_scheduled");
    await page.reload();
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
    await expect
      .poll(async () => (await readOrderState())?.status, { timeout: 15_000 })
      .toBe("fulfilled");
    await page.reload();
    await expect(page.getByRole("row").filter({ hasText: email })).toBeHidden();
  });
});
