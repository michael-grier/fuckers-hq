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
const deliveryOrderId = "7d1b8e52-3f47-4a90-8c15-9e60d2b4a831";

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
  let saveOrderShippingRecord: typeof import("@/lib/orders/shipping-record-repository")["saveOrderShippingRecord"];
  let realDbClient: typeof import("@/lib/db/client");

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    adminClient = postgres(testDatabaseUrl, { max: 1, prepare: false });
    await adminClient.unsafe(`create schema "${schemaName}"`);
    // A URL startup option survives Neon pooling; the postgres-js connection setting does not.
    const scopedDatabaseUrl = new URL(testDatabaseUrl);
    scopedDatabaseUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
    client = postgres(scopedDatabaseUrl.toString(), {
      max: 10,
      prepare: false,
    });

    for (const statement of postgresTestSchema) {
      await client.unsafe(statement);
    }

    database = drizzle(client, { schema: await import("@/lib/db/schema") });

    // The admin repository resolves its connection through getDb() rather than receiving one, so
    // the client module is replaced before the repository module is first imported. Module mocks
    // are process-wide and bun test shares one module registry across every test file, so the
    // real module is captured first and afterAll puts it back; otherwise whichever file runs
    // next would resolve getDb() to this suite's schema, dropped and disconnected below. The
    // spread snapshots the real exports as plain properties: mock.module rewrites the live
    // bindings of the namespace object itself, so holding the namespace would capture the mock.
    realDbClient = { ...(await import("@/lib/db/client")) };
    mock.module("@/lib/db/client", () => ({ getDb: () => database }));
    ({ adminOrderRepository: repository } = await import("@/lib/orders/admin-order-repository"));
    ({ saveOrderShippingRecord } = await import("@/lib/orders/shipping-record-repository"));
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
        shippingActualCostCents: 1_250,
        packedWeightGrams: 780,
        totalCents: 10400,
        currency: "cad",
      },
      {
        id: deliveryOrderId,
        orderNumber: "FHQ-20260806-DLVR0001",
        email: "skater@example.com",
        status: "paid",
        inventoryStatus: "allocated",
        fulfillmentMethod: "delivery",
        deliveryReviewStatus: "approved",
        stripeSessionId: "cs_test_delivery",
        stripePaymentIntentId: "pi_test_delivery",
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

    // Restore before the teardown below, so later test files see the real client even if a drop
    // or disconnect throws.
    mock.module("@/lib/db/client", () => ({ ...realDbClient }));
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
        trackingNumber: "1234 5678 9123 4567",
      }),
    ).resolves.toBe(true);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, shippingOrderId),
    });

    expect(order).toMatchObject({
      status: "fulfilled",
      trackingCarrier: "canada_post",
      trackingNumber: "1234 5678 9123 4567",
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
      trackingNumber: "1234 5678 9123 4567",
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
      trackingNumber: "1234 5678 9123 4567",
    });
    expect(order?.shippedAt?.toISOString()).toBe(shippedAt.toISOString());
    expect(await findDeliveries(shippingOrderId)).toHaveLength(1);
  });

  test("writes neither status nor outbox row when the transition is refused", async () => {
    // A delivery order cannot be shipped. The order and the email must both stay untouched, since a
    // queued row would eventually email a customer about a shipment that never happened.
    await expect(
      repository.applyFulfillmentTransition(deliveryOrderId, "ship", new Date(), {
        carrier: "ups",
        trackingNumber: "1Z999AA10123456784",
      }),
    ).resolves.toBe(false);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, deliveryOrderId),
    });

    expect(order).toMatchObject({
      status: "paid",
      shippedAt: null,
      trackingCarrier: null,
      trackingNumber: null,
    });
    expect(await findDeliveries(deliveryOrderId)).toHaveLength(0);
  });

  test("saves shipping facts and refuses to attach them to local delivery", async () => {
    await expect(
      saveOrderShippingRecord(shippingOrderId, {
        shippingActualCostCents: 1_425,
        shippingActualCostUnknown: false,
        packedWeightGrams: null,
        packedWeightUnknown: true,
      }),
    ).resolves.toBe("saved");
    await expect(
      saveOrderShippingRecord(deliveryOrderId, {
        shippingActualCostCents: 0,
        shippingActualCostUnknown: false,
        packedWeightGrams: 1,
        packedWeightUnknown: false,
      }),
    ).resolves.toBe("not_shipping");

    const updatedOrder = await database.query.orders.findFirst({
      where: eq(orders.id, shippingOrderId),
    });

    expect(updatedOrder).toMatchObject({
      shippingActualCostCents: 1_425,
      shippingActualCostUnknown: false,
      packedWeightGrams: null,
      packedWeightUnknown: true,
    });
  });

  test("refuses to ship until both shipping facts are complete", async () => {
    await database
      .update(orders)
      .set({
        shippingActualCostCents: null,
        shippingActualCostUnknown: false,
        packedWeightGrams: null,
        packedWeightUnknown: false,
      })
      .where(eq(orders.id, shippingOrderId));

    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", new Date(), null),
    ).resolves.toBe(false);
    await expect(findDeliveries(shippingOrderId)).resolves.toHaveLength(0);
  });

  test.each([
    {
      name: "carrier cost recorded but weight pending",
      values: { shippingActualCostCents: 1_250, packedWeightGrams: null },
    },
    {
      name: "weight recorded but carrier cost pending",
      values: { shippingActualCostCents: null, packedWeightGrams: 780 },
    },
  ] as const)("refuses to ship with $name", async ({ values }) => {
    await database
      .update(orders)
      .set({
        ...values,
        shippingActualCostUnknown: false,
        packedWeightUnknown: false,
      })
      .where(eq(orders.id, shippingOrderId));

    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", new Date(), null),
    ).resolves.toBe(false);
    const order = await database.query.orders.findFirst({
      columns: { status: true },
      where: eq(orders.id, shippingOrderId),
    });
    expect(order?.status).toBe("paid");
    await expect(findDeliveries(shippingOrderId)).resolves.toHaveLength(0);
  });

  test.each([
    {
      name: "known carrier cost and unknown weight",
      values: {
        shippingActualCostCents: 1_250,
        shippingActualCostUnknown: false,
        packedWeightGrams: null,
        packedWeightUnknown: true,
      },
    },
    {
      name: "unknown carrier cost and known weight",
      values: {
        shippingActualCostCents: null,
        shippingActualCostUnknown: true,
        packedWeightGrams: 780,
        packedWeightUnknown: false,
      },
    },
  ] as const)("ships with $name", async ({ values }) => {
    await database.update(orders).set(values).where(eq(orders.id, shippingOrderId));

    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", new Date(), null),
    ).resolves.toBe(true);
    const order = await database.query.orders.findFirst({
      columns: { status: true },
      where: eq(orders.id, shippingOrderId),
    });
    expect(order?.status).toBe("fulfilled");
    await expect(findDeliveries(shippingOrderId)).resolves.toHaveLength(1);
  });

  test("accepts explicit unknown decisions without converting them to zero", async () => {
    await database
      .update(orders)
      .set({
        shippingActualCostCents: null,
        shippingActualCostUnknown: true,
        packedWeightGrams: null,
        packedWeightUnknown: true,
      })
      .where(eq(orders.id, shippingOrderId));

    await expect(
      repository.applyFulfillmentTransition(shippingOrderId, "ship", new Date(), null),
    ).resolves.toBe(true);
    const fulfilledOrder = await database.query.orders.findFirst({
      where: eq(orders.id, shippingOrderId),
    });

    expect(fulfilledOrder).toMatchObject({
      status: "fulfilled",
      shippingActualCostCents: null,
      shippingActualCostUnknown: true,
      packedWeightGrams: null,
      packedWeightUnknown: true,
    });
  });

  test("queues the delivery email on the delivery path without touching shipment columns", async () => {
    const readyAt = new Date("2026-08-06T12:00:00.000Z");

    await expect(
      repository.applyFulfillmentTransition(deliveryOrderId, "schedule_delivery", readyAt, null),
    ).resolves.toBe(true);

    const order = await database.query.orders.findFirst({
      where: eq(orders.id, deliveryOrderId),
    });

    expect(order).toMatchObject({ status: "delivery_scheduled", shippedAt: null });
    expect(order?.deliveryScheduledAt?.toISOString()).toBe(readyAt.toISOString());

    const deliveries = await findDeliveries(deliveryOrderId);

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]).toMatchObject({
      kind: "delivery_scheduled",
      idempotencyKey: `order-delivery-scheduled/${deliveryOrderId}`,
    });
  });

  test("does not schedule an unreviewed delivery", async () => {
    await database
      .update(orders)
      .set({ deliveryReviewStatus: "pending" })
      .where(eq(orders.id, deliveryOrderId));

    await expect(
      repository.applyFulfillmentTransition(deliveryOrderId, "schedule_delivery", new Date(), null),
    ).resolves.toBe(false);
    expect(await findDeliveries(deliveryOrderId)).toHaveLength(0);
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
    delivery_review_status text,
    delivery_scheduled_at timestamptz,
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
    shipping_actual_cost_cents integer,
    shipping_actual_cost_unknown boolean not null default false,
    packed_weight_grams integer,
    packed_weight_unknown boolean not null default false,
    total_cents integer not null,
    currency text not null,
    shipping_address jsonb,
    destination_province text,
    created_at timestamptz not null default now(),
    constraint orders_fulfilled_inventory_resolved check (
      status not in ('fulfilled', 'delivery_scheduled')
      or inventory_status in ('allocated', 'released')
    ),
    constraint orders_released_inventory_requires_refund check (
      inventory_status <> 'released' or refund_status <> 'none'
    ),
    constraint orders_delivery_scheduled_requires_delivery check (
      status <> 'delivery_scheduled' or fulfillment_method = 'delivery'
    ),
    constraint orders_delivery_review_method_consistent check (
      (fulfillment_method = 'delivery' and delivery_review_status is not null)
      or (fulfillment_method = 'shipping' and delivery_review_status is null)
      or (
        fulfillment_method = 'shipping'
        and delivery_review_status in ('shipping_payment_received', 'shipping_payment_exception')
      )
    ),
    constraint orders_delivery_scheduling_requires_approval check (
      status <> 'delivery_scheduled' or delivery_review_status = 'approved'
    ),
    constraint orders_delivery_scheduled_at_required check (
      status not in ('delivery_scheduled', 'fulfilled')
      or fulfillment_method <> 'delivery'
      or delivery_scheduled_at is not null
    ),
    constraint orders_tracking_pair_complete check (
      (tracking_carrier is null and tracking_number is null)
      or (tracking_carrier is not null and tracking_number is not null)
    ),
    constraint orders_shipment_requires_shipping_method check (
      (shipped_at is null and tracking_number is null)
      or fulfillment_method = 'shipping'
    ),
    constraint orders_shipping_actual_cost_nonnegative check (
      shipping_actual_cost_cents is null or shipping_actual_cost_cents >= 0
    ),
    constraint orders_shipping_actual_cost_state_consistent check (
      not (shipping_actual_cost_unknown and shipping_actual_cost_cents is not null)
    ),
    constraint orders_packed_weight_positive check (
      packed_weight_grams is null or packed_weight_grams > 0
    ),
    constraint orders_packed_weight_state_consistent check (
      not (packed_weight_unknown and packed_weight_grams is not null)
    ),
    constraint orders_fulfilled_shipping_record_complete check (
      status <> 'fulfilled'
      or fulfillment_method <> 'shipping'
      or (
        (shipping_actual_cost_cents is not null or shipping_actual_cost_unknown)
        and (packed_weight_grams is not null or packed_weight_unknown)
      )
    )
  )`,
  `create table order_email_deliveries (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    kind text not null default 'confirmation',
    status text not null default 'pending',
    idempotency_key text not null unique,
    refund_amount_cents integer,
    refund_cumulative_cents integer,
    attempt_count integer not null default 0,
    next_attempt_at timestamptz not null default now(),
    last_attempt_at timestamptz,
    last_error_at timestamptz,
    last_error_code text,
    provider_message_id text,
    delivered_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique nulls not distinct (order_id, kind, refund_cumulative_cents)
  )`,
];
