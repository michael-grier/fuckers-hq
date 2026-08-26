import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import Stripe from "stripe";

/**
 * Helpers for the commerce tier: create REAL sandbox Checkout Sessions through the app, then
 * complete or expire them with synthetic events signed with the local STRIPE_WEBHOOK_SECRET.
 * The webhook handler trusts the signed payload verbatim (it never re-retrieves the session),
 * so a signed event carrying the real session id and metadata exercises the full paid-order
 * path with no Stripe CLI or hosted-payment step.
 */

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith("sk_test_")) {
    throw new Error("Commerce e2e specs need a sandbox STRIPE_SECRET_KEY (sk_test_...).");
  }
  return new Stripe(key);
}

function requireWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "Commerce e2e specs need STRIPE_WEBHOOK_SECRET (the same value the app verifies with; " +
        "see docs/manual-qa.md section 2). Set it in .env.local and restart the dev server.",
    );
  }
  return secret;
}

/** Adds the current PDP's selected variant to the cart and waits for the cart sheet. */
export async function addToCartFromPdp(page: Page, slug: string, variant?: string): Promise<void> {
  await page.goto(`/products/${slug}`);
  if (variant) {
    await page.getByRole("button", { name: variant, exact: true }).click();
  }
  await expect(async () => {
    await page.getByRole("button", { name: /^Add(ed)? to cart$/ }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

/** The variantId of the only line in the persisted cart. */
export async function readCartVariantId(page: Page): Promise<string> {
  const id = await page.evaluate(() => {
    const raw = window.localStorage.getItem("fuckers-hq-cart");
    if (!raw) return null;
    const lines = JSON.parse(raw).state?.lines;
    return lines?.length === 1 ? (lines[0].variantId as string) : null;
  });
  if (!id) throw new Error("Expected exactly one persisted cart line.");
  return id;
}

/**
 * Clicks Checkout in the open cart sheet and captures the hosted-checkout redirect instead of
 * following it, returning the real cs_test_ session id embedded in the URL.
 */
export async function startCheckoutFromCart(page: Page): Promise<string> {
  let checkoutUrl = "";
  await page.route("https://checkout.stripe.com/**", async (route) => {
    checkoutUrl = route.request().url();
    await route.fulfill({ contentType: "text/html", body: "<title>stripe intercepted</title>" });
  });
  await page.getByRole("dialog").getByRole("button", { name: "Checkout" }).click();
  await expect(() => {
    if (!checkoutUrl) throw new Error("no redirect yet");
  }).toPass({ timeout: 30_000 });
  const match = checkoutUrl.match(/cs_test_[A-Za-z0-9]+/);
  if (!match) throw new Error(`Hosted checkout URL had no session id: ${checkoutUrl}`);
  return match[0];
}

export type SessionTokens = { pendingCheckoutToken: string; reservationToken: string };

/** Retrieves the real session's metadata tokens, which the webhook events must carry. */
export async function getSessionTokens(sessionId: string): Promise<SessionTokens> {
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const { pendingCheckoutToken, reservationToken } = session.metadata ?? {};
  if (!pendingCheckoutToken || !reservationToken) {
    throw new Error(`Session ${sessionId} is missing checkout metadata tokens.`);
  }
  return { pendingCheckoutToken, reservationToken };
}

type CheckoutEventOptions = {
  sessionId: string;
  tokens: SessionTokens;
  /** Must equal the sum of the persisted snapshot line prices, or order creation 500s. */
  subtotalCents: number;
  email: string;
  paymentStatus?: "paid" | "unpaid";
};

/** A signed checkout.session.* event body ready to POST to the webhook route. */
export function buildSignedCheckoutEvent(
  type:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded"
    | "checkout.session.async_payment_failed"
    | "checkout.session.expired",
  options: CheckoutEventOptions,
): { payload: string; signature: string } {
  const shippingCents = 1_500;
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now().toString(36)}`,
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: options.sessionId,
        object: "checkout.session",
        mode: "payment",
        payment_status: options.paymentStatus ?? "paid",
        payment_intent: `pi_e2e_${options.tokens.reservationToken.slice(0, 12)}`,
        metadata: { ...options.tokens, fulfillmentMethod: "shipping" },
        customer_details: { email: options.email },
        amount_subtotal: options.subtotalCents,
        amount_total: options.subtotalCents + shippingCents,
        currency: "cad",
        total_details: { amount_tax: 0, amount_shipping: shippingCents },
        shipping_cost: { amount_total: shippingCents },
        collected_information: {
          shipping_details: {
            name: "E2E Customer",
            address: {
              line1: "123 Test Street",
              city: "Calgary",
              state: "AB",
              postal_code: "T1T 1T1",
              country: "CA",
            },
          },
        },
      },
    },
  });

  const signature = getStripe().webhooks.generateTestHeaderString({
    payload,
    secret: requireWebhookSecret(),
  });
  return { payload, signature };
}

/**
 * POST with a retry on connection-level failures only (ECONNRESET/EPIPE from the dev server
 * dropping a keep-alive mid-request). Safe for these endpoints because both are idempotent by
 * design: checkout converges on requestId, the webhook dedupes on the session id. HTTP error
 * statuses are returned, never retried.
 */
export async function resilientPost(
  request: APIRequestContext,
  url: string,
  options: Parameters<APIRequestContext["post"]>[1],
): Promise<import("@playwright/test").APIResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await request.post(url, options);
    } catch (error) {
      if (!/ECONNRESET|EPIPE|socket hang up/.test(String(error))) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

/** POSTs the exact signed bytes; re-serialization would invalidate the signature. */
export async function postWebhook(
  request: APIRequestContext,
  event: { payload: string; signature: string },
  overrideSignature?: string,
): Promise<number> {
  const response = await resilientPost(request, "/api/webhooks/stripe", {
    headers: {
      "content-type": "application/json",
      "stripe-signature": overrideSignature ?? event.signature,
    },
    data: event.payload,
  });
  return response.status();
}
