import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "@/lib/db/client";
import { orderItems, orders, products, productVariants } from "@/lib/db/schema";
import type { PaymentLifecycleWriter } from "@/lib/orders/payment-lifecycle";
import type { OrderInventoryReturnResult } from "@/lib/orders/return-order-inventory";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const schemaName = `restocking_test_${crypto.randomUUID().replaceAll("-", "")}`;
const productId = "912f47c9-acde-4758-90d2-17a119f07612";
const variantId = "150f008a-bd66-49fe-a10f-aa54ef7cadad";
const orderId = "818dc9e8-b5bd-46f2-b726-da299efbb030";

mock.module("server-only", () => ({}));

/** Proves refund event deduplication and inventory release against real transactional row locks. */
describe.skipIf(!testDatabaseUrl)("refunded inventory with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let database: Database;
  let payments: PaymentLifecycleWriter;
  let returnItemsToStock: (
    database: Database,
    targetOrderId: string,
  ) => Promise<OrderInventoryReturnResult>;

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
    const { createPaymentLifecycleRepository } = await import(
      "@/lib/orders/payment-lifecycle-repository"
    );
    const { returnOrderItemsToStock } = await import("@/lib/orders/order-inventory-repository");
    payments = createPaymentLifecycleRepository(database);
    returnItemsToStock = (db, targetOrderId) =>
      db.transaction((tx) => returnOrderItemsToStock(tx, targetOrderId));
  });

  beforeEach(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.unsafe(`
      truncate table stripe_payment_events, order_items, orders, product_variants, products
      restart identity cascade
    `);
    await database.insert(products).values({
      id: productId,
      slug: "refund-test-product",
      name: "Refund test product",
      category: "accessories",
      subcategory: "magnets",
      shippingProfile: "flat",
      status: "active",
    });
    await database.insert(productVariants).values({
      id: variantId,
      productId,
      name: "Black",
      sku: "REFUND-BLK",
      priceCents: 600,
      inventoryQty: 3,
    });
  });

  afterAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await adminClient.unsafe(`drop schema if exists "${schemaName}" cascade`);
    await client.end({ timeout: 5 });
    await adminClient.end({ timeout: 5 });
  });

  async function seedOrder(
    overrides: Partial<typeof orders.$inferInsert> = {},
    itemVariantId: string | null = variantId,
  ) {
    await database.insert(orders).values({
      id: orderId,
      orderNumber: "FHQ-20260827-RESTOCK1",
      email: "rider@example.com",
      status: "paid",
      inventoryStatus: "allocated",
      stripeSessionId: "cs_test_restock",
      stripePaymentIntentId: "pi_test_restock",
      subtotalCents: 600,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 600,
      currency: "cad",
      ...overrides,
    });
    await database.insert(orderItems).values({
      orderId,
      variantId: itemVariantId,
      productNameSnapshot: "Refund test product",
      variantNameSnapshot: "Black",
      unitPriceCentsSnapshot: 600,
      quantity: 2,
    });
  }

  function refundUpdate(refundedCents: number, stripeEventId = "evt_refund_restock") {
    return {
      stripeEventId,
      stripePaymentIntentId: "pi_test_restock",
      kind: "refund" as const,
      refundedCents,
      currency: "cad",
      disputeStatus: null,
      occurredAt: new Date("2026-08-27T15:00:00.000Z"),
    };
  }

  test("a full refund before fulfillment restores stock once", async () => {
    await seedOrder();

    await expect(payments.recordPaymentLifecycleUpdate(refundUpdate(600))).resolves.toEqual({
      changed: true,
      orderId,
    });
    await expect(payments.recordPaymentLifecycleUpdate(refundUpdate(600))).resolves.toEqual({
      changed: false,
      orderId,
    });

    expect(await findOrder()).toMatchObject({
      status: "refunded",
      refundStatus: "full",
      refundedCents: 600,
      inventoryStatus: "released",
    });
    expect(await findStock()).toBe(5);
  });

  test("partial and post-fulfillment refunds leave stock for an operator decision", async () => {
    await seedOrder();
    await payments.recordPaymentLifecycleUpdate(refundUpdate(200));

    expect(await findOrder()).toMatchObject({
      status: "paid",
      refundStatus: "partial",
      inventoryStatus: "allocated",
    });
    expect(await findStock()).toBe(3);

    await client.unsafe(
      `truncate table stripe_payment_events, order_items, orders restart identity cascade`,
    );
    await seedOrder({ status: "fulfilled" });
    await payments.recordPaymentLifecycleUpdate(refundUpdate(600, "evt_refund_fulfilled"));

    expect(await findOrder()).toMatchObject({
      status: "fulfilled",
      refundStatus: "full",
      inventoryStatus: "allocated",
    });
    expect(await findStock()).toBe(3);
  });

  test("the operator return is idempotent under concurrent requests", async () => {
    await seedOrder({ status: "fulfilled", refundStatus: "full", refundedCents: 600 });

    const results = await Promise.all([
      returnItemsToStock(database, orderId),
      returnItemsToStock(database, orderId),
    ]);

    expect(results.sort()).toEqual(["already_returned", "returned"]);
    expect(await findOrder()).toMatchObject({ inventoryStatus: "released" });
    expect(await findStock()).toBe(5);
  });

  test("a deleted variant does not roll back the refund or partially release inventory", async () => {
    await seedOrder({}, null);

    await payments.recordPaymentLifecycleUpdate(refundUpdate(600));

    expect(await findOrder()).toMatchObject({
      status: "refunded",
      refundStatus: "full",
      inventoryStatus: "allocated",
    });
    expect(await findStock()).toBe(3);
  });

  test("a full refund closes an inventory exception without inventing stock", async () => {
    await seedOrder({ inventoryStatus: "exception" });

    await payments.recordPaymentLifecycleUpdate(refundUpdate(600));

    expect(await findOrder()).toMatchObject({
      status: "refunded",
      refundStatus: "full",
      inventoryStatus: "released",
    });
    expect(await findStock()).toBe(3);
  });

  async function findOrder() {
    return database.query.orders.findFirst({ where: eq(orders.id, orderId) });
  }

  async function findStock() {
    return (
      await database.query.productVariants.findFirst({
        columns: { inventoryQty: true },
        where: eq(productVariants.id, variantId),
      })
    )?.inventoryQty;
  }
});

// Only the columns exercised above are included. Text status columns keep this isolated schema
// independent of the application's Postgres enum definitions while preserving its constraints.
const postgresTestSchema = [
  `create table products (
    id uuid primary key,
    slug text not null unique,
    name text not null,
    description text,
    category text not null,
    subcategory text not null,
    shipping_profile text not null,
    status text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create table product_variants (
    id uuid primary key,
    product_id uuid not null references products(id) on delete cascade,
    name text not null,
    sku text not null unique,
    price_cents integer not null,
    inventory_qty integer not null,
    reserved_qty integer not null default 0,
    position integer not null default 0
  )`,
  `create table orders (
    id uuid primary key,
    order_number text not null unique,
    email text not null,
    status text not null,
    inventory_status text not null,
    fulfillment_method text not null default 'shipping',
    delivery_review_required boolean not null default false,
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
    total_cents integer not null,
    currency text not null,
    shipping_address jsonb,
    created_at timestamptz not null default now(),
    constraint orders_fulfilled_inventory_resolved check (
      status not in ('fulfilled', 'delivery_scheduled')
      or inventory_status in ('allocated', 'released')
    ),
    constraint orders_released_inventory_requires_refund check (
      inventory_status <> 'released' or refund_status <> 'none'
    ),
    constraint orders_delivery_review_requires_delivery check (
      not delivery_review_required or fulfillment_method = 'delivery'
    )
  )`,
  `create table order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    variant_id uuid references product_variants(id) on delete set null,
    product_name_snapshot text not null,
    variant_name_snapshot text not null,
    unit_price_cents_snapshot integer not null,
    quantity integer not null
  )`,
  `create table stripe_payment_events (
    stripe_event_id text primary key,
    stripe_payment_intent_id text not null,
    kind text not null,
    refunded_cents integer,
    currency text,
    dispute_status text,
    occurred_at timestamptz not null,
    received_at timestamptz not null default now()
  )`,
];
