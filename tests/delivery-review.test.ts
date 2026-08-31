import { describe, expect, mock, test } from "bun:test";

import {
  buildShippingPaymentSessionParams,
  type DeliveryReviewRepository,
  requestOrderShippingPayment,
} from "@/lib/orders/delivery-review";

const requestId = "9a79cc53-176c-460e-b108-c77fe0df2330";
const orderId = "89325eb0-05b3-4f25-82ce-afcd1189e30f";
const expiresAt = new Date("2026-09-01T12:00:00.000Z");
const settings = {
  appUrl: "https://example.com/",
  allowedCountries: ["CA" as const],
  taxEnabled: true,
};

function makePrepared(checkoutUrl: string | null = null) {
  const params = buildShippingPaymentSessionParams(
    {
      requestId,
      generation: 2,
      orderNumber: "FHQ-TEST-1001",
      customerEmail: "rider@example.com",
      amountCents: 2000,
      currency: "cad",
      expiresAt,
    },
    settings,
  );

  return {
    requestId,
    generation: 2,
    stripeCreateIdempotencyKey: `order-shipping-payment/${requestId}/2`,
    stripeSessionParams: params as unknown as Record<string, unknown>,
    checkoutUrl,
  };
}

function makeRepository(
  overrides: Partial<DeliveryReviewRepository> = {},
): DeliveryReviewRepository {
  return {
    approveDeliveryAddress: mock(async () => "approved" as const),
    prepareShippingPayment: mock(async () => makePrepared()),
    linkShippingPaymentSession: mock(async (_request, session) => ({
      checkoutUrl: session.url,
      emailQueued: true,
    })),
    markShippingPaymentCreationFailed: mock(async () => {}),
    ...overrides,
  };
}

describe("supplemental shipping Checkout", () => {
  test("pins the amount, tax code, address collection, metadata, and dedicated return pages", () => {
    const params = buildShippingPaymentSessionParams(
      {
        requestId,
        generation: 2,
        orderNumber: "FHQ-TEST-1001",
        customerEmail: "rider@example.com",
        amountCents: 2000,
        currency: "cad",
        expiresAt,
      },
      settings,
    );

    expect(params).toMatchObject({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: "rider@example.com",
      automatic_tax: { enabled: true },
      shipping_address_collection: { allowed_countries: ["CA"] },
      allow_promotion_codes: false,
      success_url:
        "https://example.com/order/shipping-payment/success?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://example.com/order/shipping-payment/cancelled",
      metadata: {
        checkoutKind: "order_shipping_payment",
        shippingPaymentRequestId: requestId,
        shippingPaymentGeneration: "2",
      },
    });
    expect(params.line_items?.[0]).toMatchObject({
      quantity: 1,
      price_data: {
        currency: "cad",
        unit_amount: 2000,
        tax_behavior: "exclusive",
        product_data: { tax_code: "txcd_92010001" },
      },
    });
  });

  test("creates Stripe once with the persisted idempotency key, then links the Session", async () => {
    const repository = makeRepository();
    const sessions = {
      create: mock(async () => ({ id: "cs_test_shipping", url: "https://checkout.stripe.test/1" })),
    };

    await expect(
      requestOrderShippingPayment(orderId, settings, { repository, sessions }),
    ).resolves.toEqual({ checkoutUrl: "https://checkout.stripe.test/1", emailQueued: true });
    expect(sessions.create).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: `order-shipping-payment/${requestId}/2`,
    });
    expect(repository.linkShippingPaymentSession).toHaveBeenCalledTimes(1);
  });

  test("reuses an already-linked request without another Stripe call", async () => {
    const repository = makeRepository({
      prepareShippingPayment: mock(async () => makePrepared("https://checkout.stripe.test/1")),
    });
    const sessions = { create: mock(async () => ({ id: "unused", url: "unused" })) };

    await expect(
      requestOrderShippingPayment(orderId, settings, { repository, sessions }),
    ).resolves.toEqual({ checkoutUrl: "https://checkout.stripe.test/1", emailQueued: false });
    expect(sessions.create).not.toHaveBeenCalled();
  });

  test("marks only definitive Stripe creation failures as replaceable", async () => {
    const repository = makeRepository();
    const error = { type: "StripeInvalidRequestError" };

    await expect(
      requestOrderShippingPayment(orderId, settings, {
        repository,
        sessions: { create: async () => Promise.reject(error) },
      }),
    ).rejects.toBe(error);
    expect(repository.markShippingPaymentCreationFailed).toHaveBeenCalledTimes(1);
  });
});
