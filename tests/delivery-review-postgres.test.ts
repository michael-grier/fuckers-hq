import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "@/lib/db/client";
import {
  orderEmailDeliveries,
  orderShippingPaymentRequests,
  orders,
  pendingCheckouts,
} from "@/lib/db/schema";
import type {
  DeliveryReviewRepository,
  ShippingPaymentEventWriter,
} from "@/lib/orders/delivery-review";
import type { PaymentLifecycleWriter } from "@/lib/orders/payment-lifecycle";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const unpooledTestDatabaseUrl = testDatabaseUrl ? toUnpooledNeonUrl(testDatabaseUrl) : undefined;
const schemaName = `delivery_review_test_${crypto.randomUUID().replaceAll("-", "")}`;
const orderId = "f2c1f43b-d3a5-409b-9674-cffb5538268c";
const variantId = "c56a95eb-fde3-4091-99a3-b71d11f1e93e";
const originalAddress = {
  name: "Local Rider",
  address: {
    line1: "123 Local Street",
    city: "Calgary",
    state: "AB",
    postal_code: "T2P 1J9",
    country: "CA",
  },
};
const shippingAddress = {
  name: "Shipping Rider",
  address: {
    line1: "456 Shipping Avenue",
    city: "Saskatoon",
    state: "SK",
    postal_code: "S7K 3J8",
    country: "CA",
  },
};

mock.module("server-only", () => ({}));

/** Proves the address decision, supplemental charge, and financial exception as one DB workflow. */
describe.skipIf(!unpooledTestDatabaseUrl)("delivery review with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let scopedDatabaseUrl: string;
  let database: Database;
  let deliveryReview: DeliveryReviewRepository;
  let shippingPayments: ShippingPaymentEventWriter;
  let payments: PaymentLifecycleWriter;

  beforeAll(async () => {
    if (!unpooledTestDatabaseUrl) {
      return;
    }

    adminClient = postgres(unpooledTestDatabaseUrl, { max: 1, prepare: false });
    await adminClient.unsafe(`create schema "${schemaName}"`);
    const scopedUrl = new URL(unpooledTestDatabaseUrl);
    scopedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
    scopedDatabaseUrl = scopedUrl.toString();
    client = postgres(scopedDatabaseUrl, { max: 10, prepare: false });

    for (const statement of postgresTestSchema) {
      await client.unsafe(statement);
    }

    database = drizzle(client, { schema: await import("@/lib/db/schema") });
    const { createDeliveryReviewRepository } = await import(
      "@/lib/orders/delivery-review-repository"
    );
    const { createShippingPaymentRepository } = await import(
      "@/lib/orders/shipping-payment-repository"
    );
    const { createPaymentLifecycleRepository } = await import(
      "@/lib/orders/payment-lifecycle-repository"
    );
    deliveryReview = createDeliveryReviewRepository(database);
    shippingPayments = createShippingPaymentRepository(database);
    payments = createPaymentLifecycleRepository(database);
  });

  beforeEach(async () => {
    if (!unpooledTestDatabaseUrl) {
      return;
    }

    await client.unsafe(`
      truncate table stripe_payment_events, order_email_deliveries,
        order_shipping_payment_requests, orders, pending_checkouts restart identity cascade
    `);
    await database.insert(pendingCheckouts).values({
      token: "checkout_delivery_review_123",
      items: [{ variantId, quantity: 1 }],
      lineItems: [
        {
          variantId,
          productName: "Test Deck",
          variantName: "8.25",
          unitPriceCents: 6000,
          quantity: 1,
          currency: "cad",
          shippingProfile: "deck",
          shippingRateCents: 2000,
        },
      ],
      fulfillmentMethod: "delivery",
      stripeSessionId: "cs_test_original_delivery",
      expiresAt: new Date("2026-09-01T13:00:00.000Z"),
      completedAt: new Date("2026-09-01T12:00:00.000Z"),
    });
    await database.insert(orders).values({
      id: orderId,
      orderNumber: "FHQ-20260901-REVIEW01",
      email: "rider@example.com",
      status: "paid",
      inventoryStatus: "allocated",
      fulfillmentMethod: "delivery",
      deliveryReviewStatus: "pending",
      stripeSessionId: "cs_test_original_delivery",
      stripePaymentIntentId: "pi_test_original_delivery",
      subtotalCents: 6000,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 6000,
      currency: "cad",
      shippingAddress: originalAddress,
      destinationProvince: "AB",
    });
  });

  afterAll(async () => {
    if (!unpooledTestDatabaseUrl) {
      return;
    }

    await adminClient.unsafe(`drop schema if exists "${schemaName}" cascade`);
    await client.end({ timeout: 5 });
    await adminClient.end({ timeout: 5 });
  });

  test("concurrent address approvals converge on one approved decision", async () => {
    const results = await Promise.all([
      deliveryReview.approveDeliveryAddress(orderId),
      deliveryReview.approveDeliveryAddress(orderId),
    ]);

    expect(results.sort()).toEqual(["already_approved", "approved"]);
    expect(await findOrder()).toMatchObject({ deliveryReviewStatus: "approved" });
  });

  test("the expand-phase trigger preserves writes from the previous application version", async () => {
    const legacyOrderId = "08f1ecaf-f50d-42d2-a9ec-2bdcf81b89b4";
    await database.insert(orders).values({
      id: legacyOrderId,
      orderNumber: "FHQ-20260901-LEGACY01",
      email: "legacy@example.com",
      status: "paid",
      inventoryStatus: "allocated",
      fulfillmentMethod: "delivery",
      deliveryReviewStatus: null,
      stripeSessionId: "cs_test_legacy_delivery",
      stripePaymentIntentId: "pi_test_legacy_delivery",
      subtotalCents: 6000,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 6000,
      currency: "cad",
      shippingAddress: originalAddress,
      destinationProvince: "AB",
    });

    expect(
      await database.query.orders.findFirst({ where: eq(orders.id, legacyOrderId) }),
    ).toMatchObject({ deliveryReviewStatus: "pending" });

    await database
      .update(orders)
      .set({ status: "delivery_scheduled", deliveryScheduledAt: new Date() })
      .where(eq(orders.id, legacyOrderId));

    expect(
      await database.query.orders.findFirst({ where: eq(orders.id, legacyOrderId) }),
    ).toMatchObject({ deliveryReviewStatus: "approved" });
  });

  test("concurrent shipping requests share one generation and queue one email", async () => {
    const now = new Date("2026-09-01T12:00:00.000Z");
    const [first, second] = await Promise.all([
      deliveryReview.prepareShippingPayment(orderId, settings, now),
      deliveryReview.prepareShippingPayment(orderId, settings, now),
    ]);

    expect(second).toEqual(first);
    expect(first).toMatchObject({ generation: 1, checkoutUrl: null });
    await deliveryReview.linkShippingPaymentSession(
      first,
      { id: "cs_test_shipping_1", url: "https://checkout.stripe.test/shipping-1" },
      now,
    );
    await deliveryReview.linkShippingPaymentSession(
      first,
      { id: "cs_test_shipping_1", url: "https://checkout.stripe.test/shipping-1" },
      now,
    );

    expect(await findOrder()).toMatchObject({ deliveryReviewStatus: "shipping_payment_pending" });
    expect(await database.select().from(orderShippingPaymentRequests)).toHaveLength(1);
    expect(await database.select().from(orderEmailDeliveries)).toMatchObject([
      {
        kind: "shipping_payment_request",
        status: "pending",
        idempotencyKey: `order-shipping-payment/${orderId}/1`,
      },
    ]);
  });

  test("a paid webhook locks the order before an expired request", async () => {
    const request = await prepareLinkedRequest();
    await database
      .update(orderShippingPaymentRequests)
      .set({ expiresAt: new Date("2026-09-01T11:59:00.000Z") })
      .where(eq(orderShippingPaymentRequests.id, request.id));

    const applicationName = `shipping_lock_${crypto.randomUUID()}`;
    const paymentUrl = new URL(scopedDatabaseUrl);
    paymentUrl.searchParams.set("application_name", applicationName);
    const paymentClient = postgres(paymentUrl.toString(), { max: 1, prepare: false });
    const paymentDatabase: Database = drizzle(paymentClient, {
      schema: await import("@/lib/db/schema"),
    });
    const { createShippingPaymentRepository } = await import(
      "@/lib/orders/shipping-payment-repository"
    );
    const paymentRepository = createShippingPaymentRepository(paymentDatabase);
    let paymentPromise:
      | ReturnType<ShippingPaymentEventWriter["recordPaidShippingPayment"]>
      | undefined;

    try {
      await client.begin(async (blocker) => {
        await blocker`select id from orders where id = ${orderId} for update`;
        paymentPromise = paymentRepository.recordPaidShippingPayment(
          paidShippingPayment(request.id, request.generation, "lock"),
        );
        await waitForBlockedApplication(applicationName);

        // This succeeds only when the webhook has not taken the request lock while waiting for
        // the order. The reverse order would deadlock against an expired-session replacement.
        const lockedRequest = await blocker`
          select id from order_shipping_payment_requests
          where id = ${request.id}
          for update nowait
        `;
        expect(lockedRequest).toHaveLength(1);
      });

      if (!paymentPromise) {
        throw new Error("Shipping-payment lock test did not start its webhook transaction.");
      }

      await expect(paymentPromise).resolves.toEqual({ changed: true, orderId });
    } finally {
      await paymentPromise?.catch(() => undefined);
      await paymentClient.end({ timeout: 5 });
    }
  });

  test("a paid shipping Session converts fulfillment but preserves the original order facts", async () => {
    const request = await prepareLinkedRequest();
    const payment = paidShippingPayment(request.id, request.generation, "1");

    await expect(shippingPayments.recordPaidShippingPayment(payment)).resolves.toEqual({
      changed: true,
      orderId,
    });
    await expect(shippingPayments.recordPaidShippingPayment(payment)).resolves.toEqual({
      changed: false,
      orderId,
    });

    expect(await findOrder()).toMatchObject({
      fulfillmentMethod: "shipping",
      deliveryReviewStatus: "shipping_payment_received",
      subtotalCents: 6000,
      shippingCents: 0,
      totalCents: 6000,
      shippingAddress: originalAddress,
      destinationProvince: "SK",
    });
    expect(await findRequest(request.id)).toMatchObject({
      status: "paid",
      taxCents: 100,
      totalCents: 2100,
      shippingAddress,
    });
    expect(await database.select().from(orderEmailDeliveries)).toMatchObject([
      { status: "cancelled" },
    ]);
  });

  test("a converted order clears a province not supported by the final shipping address", async () => {
    const request = await prepareLinkedRequest();
    const payment = {
      ...paidShippingPayment(request.id, request.generation, "unknown-province"),
      shippingAddress: {
        ...shippingAddress,
        address: { ...shippingAddress.address, state: "Saskatchewan" },
      },
      destinationProvince: null,
    };

    await shippingPayments.recordPaidShippingPayment(payment);

    expect(await findOrder()).toMatchObject({
      fulfillmentMethod: "shipping",
      deliveryReviewStatus: "shipping_payment_received",
      destinationProvince: null,
    });
  });

  test("a paid shipping Session preserves an already-sent request email", async () => {
    const request = await prepareLinkedRequest();
    const deliveredAt = new Date("2026-09-01T12:01:00.000Z");
    await database
      .update(orderEmailDeliveries)
      .set({
        status: "sent",
        providerMessageId: "email_shipping_request_1",
        deliveredAt,
      })
      .where(eq(orderEmailDeliveries.orderId, orderId));

    await shippingPayments.recordPaidShippingPayment(
      paidShippingPayment(request.id, request.generation, "sent"),
    );

    expect(await database.query.orderEmailDeliveries.findFirst()).toMatchObject({
      status: "sent",
      providerMessageId: "email_shipping_request_1",
      deliveredAt,
    });
  });

  test("a supplemental refund creates a fulfillment-blocking exception without restocking", async () => {
    const request = await prepareLinkedRequest();
    await shippingPayments.recordPaidShippingPayment(
      paidShippingPayment(request.id, request.generation, "refund"),
    );

    await expect(
      payments.recordPaymentLifecycleUpdate({
        stripeEventId: "evt_shipping_refund",
        stripePaymentIntentId: "pi_test_shipping_refund",
        kind: "refund",
        refundedCents: 500,
        currency: "cad",
        disputeStatus: null,
        occurredAt: new Date("2026-09-01T12:30:00.000Z"),
      }),
    ).resolves.toEqual({ changed: true, orderId });

    expect(await findOrder()).toMatchObject({
      status: "paid",
      inventoryStatus: "allocated",
      deliveryReviewStatus: "shipping_payment_exception",
      refundStatus: "none",
      refundedCents: 0,
    });
    expect(await findRequest(request.id)).toMatchObject({
      refundStatus: "partial",
      refundedCents: 500,
    });
  });

  test("a late payment from a replaced generation is retained as an exception", async () => {
    const first = await prepareLinkedRequest();
    await shippingPayments.closeShippingPayment(
      { requestId: first.id, generation: first.generation, stripeSessionId: "cs_test_shipping_1" },
      "expired",
    );
    const second = await prepareLinkedRequest("2");

    await shippingPayments.recordPaidShippingPayment(
      paidShippingPayment(first.id, first.generation, "late"),
    );

    expect(await findRequest(first.id)).toMatchObject({ status: "paid" });
    expect(await findRequest(second.id)).toMatchObject({ status: "pending" });
    expect(await findOrder()).toMatchObject({
      fulfillmentMethod: "delivery",
      deliveryReviewStatus: "shipping_payment_exception",
      destinationProvince: "AB",
    });
  });

  async function prepareLinkedRequest(suffix = "1") {
    const request = await deliveryReview.prepareShippingPayment(
      orderId,
      settings,
      new Date(`2026-09-01T12:0${Number(suffix) - 1}:00.000Z`),
    );
    await deliveryReview.linkShippingPaymentSession(
      request,
      {
        id: `cs_test_shipping_${suffix}`,
        url: `https://checkout.stripe.test/shipping-${suffix}`,
      },
      new Date("2026-09-01T12:00:00.000Z"),
    );

    return { id: request.requestId, generation: request.generation };
  }

  function paidShippingPayment(requestId: string, generation: number, suffix: string) {
    return {
      requestId,
      generation,
      stripeSessionId: `cs_test_shipping_${suffix === "1" ? "1" : suffix === "late" ? "1" : "1"}`,
      stripePaymentIntentId: `pi_test_shipping_${suffix}`,
      subtotalCents: 2000,
      taxCents: 100,
      totalCents: 2100,
      currency: "cad",
      shippingAddress,
      destinationProvince: "SK" as const,
    };
  }

  async function findOrder() {
    return database.query.orders.findFirst({ where: eq(orders.id, orderId) });
  }

  async function findRequest(requestId: string) {
    return database.query.orderShippingPaymentRequests.findFirst({
      where: eq(orderShippingPaymentRequests.id, requestId),
    });
  }

  async function waitForBlockedApplication(applicationName: string): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const [activity] = await adminClient<{ blocked: boolean }[]>`
        select exists (
          select 1 from pg_stat_activity
          where application_name = ${applicationName}
            and wait_event_type = 'Lock'
        ) as blocked
      `;

      if (activity?.blocked) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 20));
    }

    throw new Error("Shipping-payment webhook did not wait on the locked order.");
  }
});

const settings = {
  appUrl: "https://example.com",
  allowedCountries: ["CA" as const],
  taxEnabled: true,
};

/** Neon poolers reject startup `search_path`; the direct endpoint accepts the isolated schema. */
function toUnpooledNeonUrl(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.replace("-pooler.", ".");
  return url.toString();
}

const postgresTestSchema = [
  `create table pending_checkouts (
    id uuid primary key default gen_random_uuid(), token text not null unique, items jsonb not null,
    line_items jsonb, fulfillment_method text not null, stripe_session_id text unique,
    created_at timestamptz not null default now(), expires_at timestamptz not null,
    completed_at timestamptz
  )`,
  // Cross-column order constraints are deliberately deferred until the previous production
  // writer can no longer create delivery orders without review state.
  `create table orders (
    id uuid primary key default gen_random_uuid(), order_number text not null unique,
    email text not null, status text not null, inventory_status text not null,
    fulfillment_method text not null, delivery_review_status text, delivery_scheduled_at timestamptz,
    shipped_at timestamptz, tracking_carrier text, tracking_number text,
    stripe_session_id text not null unique, stripe_payment_intent_id text unique,
    refund_status text not null default 'none', refunded_cents integer not null default 0,
    dispute_status text not null default 'none', subtotal_cents integer not null,
    tax_cents integer not null, shipping_cents integer not null, total_cents integer not null,
    currency text not null, shipping_address jsonb, destination_province text,
    created_at timestamptz not null default now()
  )`,
  `create function set_legacy_delivery_review_status() returns trigger as $$
  begin
    if new.fulfillment_method = 'delivery' and new.delivery_review_status is null then
      new.delivery_review_status := case when new.status = 'paid' then 'pending' else 'approved' end;
    elsif new.fulfillment_method = 'delivery' and new.status = 'delivery_scheduled'
      and new.delivery_review_status = 'pending' then
      new.delivery_review_status := 'approved';
    end if;
    return new;
  end;
  $$ language plpgsql`,
  `create trigger orders_legacy_delivery_review_status
    before insert or update of fulfillment_method, status, delivery_review_status on orders
    for each row execute function set_legacy_delivery_review_status()`,
  `create table order_shipping_payment_requests (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    generation integer not null default 1, status text not null default 'provisioning',
    amount_cents integer not null,
    tax_cents integer, total_cents integer, currency text not null, stripe_session_id text unique,
    stripe_payment_intent_id text unique, stripe_create_idempotency_key text not null unique,
    stripe_session_params jsonb not null, checkout_url text, shipping_address jsonb,
    expires_at timestamptz not null, paid_at timestamptz, refund_status text not null default 'none',
    refunded_cents integer not null default 0, dispute_status text not null default 'none',
    last_error_code text, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(), unique (order_id, generation),
    constraint order_shipping_payment_requests_generation_positive check (generation > 0),
    constraint order_shipping_payment_requests_amount_nonnegative check (amount_cents >= 0),
    constraint order_shipping_payment_requests_tax_nonnegative
      check (tax_cents is null or tax_cents >= 0),
    constraint order_shipping_payment_requests_total_nonnegative
      check (total_cents is null or total_cents >= 0),
    constraint order_shipping_payment_requests_refunded_nonnegative check (refunded_cents >= 0),
    constraint order_shipping_payment_requests_refund_not_above_total
      check (total_cents is null or refunded_cents <= total_cents),
    constraint order_shipping_payment_requests_paid_state_consistent check ((
      status = 'paid' and stripe_session_id is not null and stripe_payment_intent_id is not null
      and tax_cents is not null and total_cents is not null and shipping_address is not null
      and paid_at is not null
    ) or (
      status <> 'paid' and stripe_payment_intent_id is null and tax_cents is null
      and total_cents is null and shipping_address is null and paid_at is null
      and refund_status = 'none' and refunded_cents = 0 and dispute_status = 'none'
    )),
    constraint order_shipping_payment_requests_linked_state_has_session
      check (status not in ('pending', 'paid', 'expired') or stripe_session_id is not null)
  )`,
  `create table order_email_deliveries (
    id uuid primary key default gen_random_uuid(), order_id uuid not null references orders(id),
    kind text not null, status text not null default 'pending', idempotency_key text not null unique,
    attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
    last_attempt_at timestamptz, last_error_at timestamptz, last_error_code text,
    provider_message_id text, delivered_at timestamptz, created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(), unique (order_id, kind)
  )`,
  `create table stripe_payment_events (
    stripe_event_id text primary key, stripe_payment_intent_id text not null, kind text not null,
    refunded_cents integer, currency text, dispute_status text, occurred_at timestamptz not null,
    received_at timestamptz not null default now()
  )`,
];
