import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "@/lib/db/client";
import { orderEmailDeliveries, orders } from "@/lib/db/schema";
import type { OrderFulfillmentRepository } from "@/lib/orders/order-fulfillment";
import type { InventoryExceptionRepository } from "@/lib/orders/resolve-inventory-exception";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const schemaName = `fulfillment_test_${crypto.randomUUID().replaceAll("-", "")}`;
const shippingOrderId = "0a3c9f18-64e5-4d33-90c4-2b6f5a1d77e2";
const pickupOrderId = "7d1b8e52-3f47-4a90-8c15-9e60d2b4a831";

mock.module("server-only", () => ({}));

/**
 * Covers what the unit tests structurally cannot: that one `ship` transition writes the order state
 * and its outbox row in the same transaction. A regression that fulfils an order without queuing the
 * `shipped` row leaves the customer silently uninformed, which is the exact failure this feature
 * exists to prevent, and a mocked repository would never catch it.
 */
describe.skipIf(!testDatabaseUrl)("admin fulfillment transitions with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let database: Database;
  let repository: OrderFulfillmentRepository & InventoryExceptionRepository;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    adminClient = postgres(testDatabaseUrl, { max: 1, prepare: false });
    await adminClient.unsafe(`create schema "${schemaName}"`);
    client = postgres(testDatabaseUrl, {
      max: 10,
      prepare: false,
      connection: { search_path: schemaName },
    });

    for (const statement of postgresTestSchema) {
      await client.unsafe(statement);
    }

    database = drizzle(client, { schema: await import("@/lib/db/schema") });

    // The admin repository resolves its connection through getDb() rather than receiving one, so
    // the client module is replaced before the repository module is first imported.
    mock.module("@/lib/db/client", () => ({ getDb: () => database }));
    ({ adminOrderRepository: repository } = await import("@/lib/orders/admin-order-repository"));
  });

  beforeEach(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.unsafe(`
      truncate table order_email_deliveries, orders restart identity cascade
    `);
    await database.insert(orders).values([
      {
        id: shippingOrderId,
        orderNumber: "FHQ-20260806-SHIP0001",
        email: "skater@example.com",
        status: "paid",
        inventoryStatus: "allocated",
        fulfillmentMethod: "shipping",
        // Present so the transition takes its advisory-lock path, as it does in production.
        stripeSessionId: "cs_test_shipping",
        stripePaymentIntentId: "pi_test_shipping",
        subtotalCents: 8900,
        taxCents: 0,
        shippingCents: 1500,
        totalCents: 10400,
        currency: "cad",
      },
      {
        id: pickupOrderId,
        orderNumber: "FHQ-20260806-PICK0001",
        email: "skater@example.com",
        status: "paid",
        inventoryStatus: "allocated",
        fulfillmentMethod: "pickup",
        stripeSessionId: "cs_test_pickup",
        stripePaymentIntentId: "pi_test_pickup",
        subtotalCents: 8900,
        taxCents: 0,
        shippingCents: 0,
        totalCents: 8900,
        currency: "cad",
      },
    ]);
  });

  afterAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await adminClient.unsafe(`drop schema if exists "${schemaName}" cascade`);
    await client.end({ timeout: 5 });
    await adminClient.end({ timeout: 5 });
  });

  async function findDeliveries(orderId: string) {
    return database
      .select()
      .from(orderEmailDeliveries)
      .where(eq(orderEmailDeliveries.orderId, orderId));
  }

  test("ships an order, records tracking, and queues exactly one shipped email", async () => {
    const shippedAt = new Date("2026-08-06T12:00:00.000Z");

    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", shippedAt, {
        carrier: "canada_post",
        trackingNumber: "1234 5678",
      }),
    ).resolves.toBe(true);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, shippingOrderId),
    });

    expect(order).toMatchObject({
      status: "fulfilled",
      trackingCarrier: "canada_post",
      trackingNumber: "1234 5678",
    });
    expect(order?.shippedAt?.toISOString()).toBe(shippedAt.toISOString());

    const deliveries = await findDeliveries(shippingOrderId);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      kind: "shipped",
      status: "pending",
      attemptCount: 0,
      idempotencyKey: `order-shipped/${shippingOrderId}`,
    });
  });

  test("queues the notification for a shipment sent without tracking", async () => {
    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", new Date(), null),
    ).resolves.toBe(true);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, shippingOrderId),
    });

    expect(order).toMatchObject({
      status: "fulfilled",
      trackingCarrier: null,
      trackingNumber: null,
    });
    // Tracking is optional; the customer still has to be told the order left.
    expect(await findDeliveries(shippingOrderId)).toHaveLength(1);
  });

  test("treats a repeated ship as a no-op instead of re-queuing or overwriting tracking", async () => {
    const shippedAt = new Date("2026-08-06T12:00:00.000Z");

    await repository.applyFulfillmentTransition(shippingOrderId, "ship", shippedAt, {
      carrier: "canada_post",
      trackingNumber: "1234 5678",
    });
    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", new Date(), {
        carrier: "ups",
        trackingNumber: "1Z999AA10123456784",
      }),
    ).resolves.toBe(false);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, shippingOrderId),
    });

    // The status guard rejected the second write, so the original shipment stands unchanged.
    expect(order).toMatchObject({
      trackingCarrier: "canada_post",
      trackingNumber: "1234 5678",
    });
    expect(order?.shippedAt?.toISOString()).toBe(shippedAt.toISOString());
    expect(await findDeliveries(shippingOrderId)).toHaveLength(1);
  });

  test("writes neither status nor outbox row when the transition is refused", async () => {
    // A pickup order cannot be shipped. The order and the email must both stay untouched, since a
    // queued row would eventually email a customer about a shipment that never happened.
    await expect(
      repository.applyFulfillmentTransition(pickupOrderId, "ship", new Date(), {
        carrier: "ups",
        trackingNumber: "1Z999AA10123456784",
      }),
    ).resolves.toBe(false);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, pickupOrderId),
    });

    expect(order).toMatchObject({
      status: "paid",
      shippedAt: null,
      trackingCarrier: null,
      trackingNumber: null,
    });
    expect(await findDeliveries(pickupOrderId)).toHaveLength(0);
  });

  test("queues the pickup email on the pickup path without touching shipment columns", async () => {
    const readyAt = new Date("2026-08-06T12:00:00.000Z");

    await expect(
      repository.applyFulfillmentTransition(pickupOrderId, "ready_for_pickup", readyAt, null),
    ).resolves.toBe(true);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, pickupOrderId),
    });

    expect(order).toMatchObject({ status: "ready_for_pickup", shippedAt: null });
    expect(order?.readyForPickupAt?.toISOString()).toBe(readyAt.toISOString());

    const deliveries = await findDeliveries(pickupOrderId);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      kind: "pickup_ready",
      idempotencyKey: `order-pickup-ready/${pickupOrderId}`,
    });
  });
});

// Mirrors the production DDL for only the tables this transition touches. Enum columns are declared
// as text, matching the other Postgres suites, so the schema can be created without the app's types.
const postgresTestSchema = [
  `create table orders (
    id uuid primary key default gen_random_uuid(),
    order_number text not null unique,
    email text not null,
    status text not null,
    inventory_status text not null,
    fulfillment_method text not null default 'shipping',
    ready_for_pickup_at timestamptz,
    shipped_at timestamptz,
    tracking_carrier text,
    tracking_number text,
    stripe_session_id text not null unique,
    stripe_payment_intent_id text unique,
    refund_status text not null default 'none',
    refunded_cents integer not null default 0,
    dispute_status text not null default 'none',
    subtotal_cents integer not null,
    tax_cents integer not null,
    shipping_cents integer not null,
    total_cents integer not null,
    currency text not null,
    shipping_address jsonb,
    created_at timestamptz not null default now(),
    constraint orders_fulfilled_inventory_allocated check (
      status not in ('fulfilled', 'ready_for_pickup') or inventory_status = 'allocated'
    ),
    constraint orders_ready_for_pickup_requires_pickup check (
      status <> 'ready_for_pickup' or fulfillment_method = 'pickup'
    ),
    constraint orders_ready_for_pickup_at_required check (
      status not in ('ready_for_pickup', 'fulfilled')
      or fulfillment_method <> 'pickup'
      or ready_for_pickup_at is not null
    ),
    constraint orders_tracking_pair_complete check (
      (tracking_carrier is null and tracking_number is null)
      or (tracking_carrier is not null and tracking_number is not null)
    ),
    constraint orders_shipment_requires_shipping_method check (
      (shipped_at is null and tracking_number is null)
      or fulfillment_method = 'shipping'
    )
  )`,
  `create table order_email_deliveries (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    kind text not null default 'confirmation',
    status text not null default 'pending',
    idempotency_key text not null unique,
    attempt_count integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    last_attempt_at timestamptz,
    last_error_at timestamptz,
    last_error_code text,
    provider_message_id text,
    delivered_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (order_id, kind)
  )`,
];
