import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { CheckoutRepository } from "@/lib/checkout/create-hosted-checkout";
import type { ReservationEventWriter } from "@/lib/checkout/reservation-events";
import type { Database } from "@/lib/db/client";
import {
  inventoryReservations,
  orderEmailDeliveries,
  orders,
  pendingCheckouts,
  products,
  productVariants,
  stripePaymentEvents,
} from "@/lib/db/schema";
import type { PaidOrderWriter } from "@/lib/orders/create-paid-order";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const schemaName = `reservation_test_${crypto.randomUUID().replaceAll("-", "")}`;
const variantId = "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6";
const secondVariantId = "879dd483-16c9-4d6c-885f-b00525f84923";
const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";

mock.module("server-only", () => ({}));

describe.skipIf(!testDatabaseUrl)("inventory reservations with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let database: Database;
  let checkoutRepository: CheckoutRepository;
  let reservationEvents: ReservationEventWriter;
  let paidOrders: PaidOrderWriter;

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

    database = drizzle(client, {
      schema: await import("@/lib/db/schema"),
    });
    const { createCheckoutRepository } = await import("@/lib/checkout/repository");
    const { createReservationEventRepository } = await import(
      "@/lib/checkout/reservation-event-repository"
    );
    const { createPaidOrderRepository } = await import("@/lib/orders/paid-order-repository");
    checkoutRepository = createCheckoutRepository(database);
    reservationEvents = createReservationEventRepository(database);
    paidOrders = createPaidOrderRepository(database);
  });

  beforeEach(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.unsafe(`
      truncate table
        order_email_deliveries,
        order_items,
        orders,
        inventory_reservation_items,
        inventory_reservations,
        pending_checkouts,
        stripe_payment_events,
        product_variants,
        products
      restart identity cascade
    `);
    await database.insert(products).values({
      id: productId,
      slug: "database-deck",
      name: "Database Deck",
      category: "hardgoods",
      subcategory: "decks",
      shippingProfile: "deck",
      status: "active",
    });
  });

  afterAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.end();
    await adminClient.unsafe(`drop schema "${schemaName}" cascade`);
    await adminClient.end();
  });

  test("two buyers compete for the final unit and duplicate requests converge", async () => {
    await insertVariant(database, variantId, 1);
    const first = reserve(checkoutRepository, variantId, "10000000-0000-4000-8000-000000000001");
    const competing = reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-000000000002",
    );
    const results = await Promise.allSettled([first, competing]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 1,
      reservedQty: 1,
    });
    expect(await database.$count(inventoryReservations)).toBe(1);
    expect(await database.$count(pendingCheckouts)).toBe(1);

    await resetCommerceRows(database);
    await insertVariant(database, variantId, 2);
    const requestId = "10000000-0000-4000-8000-000000000003";
    const duplicates = await Promise.all([
      reserve(checkoutRepository, variantId, requestId),
      reserve(checkoutRepository, variantId, requestId),
    ]);

    expect(duplicates[0].reservationToken).toBe(duplicates[1].reservationToken);
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 2,
      reservedQty: 1,
    });
    expect(await database.$count(inventoryReservations)).toBe(1);
  });

  test("carries the delivery method from the reserved checkout onto the paid order", async () => {
    await insertVariant(database, variantId, 1);

    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-00000000000a",
      "delivery",
    );

    expect(reservation.fulfillmentMethod).toBe("delivery");

    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_delivery");
    await paidOrders.createPaidOrder(paidCheckout(reservation, "cs_delivery"));

    const order = await database.query.orders.findFirst({
      columns: { fulfillmentMethod: true, status: true, deliveryScheduledAt: true },
    });

    // The method comes from the server-written pending checkout, never from Stripe metadata.
    expect(order).toEqual({
      fulfillmentMethod: "delivery",
      status: "paid",
      deliveryScheduledAt: null,
    });
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 0,
      reservedQty: 0,
    });
  });

  test("rejects a delivery subtotal below the minimum before reserving inventory", async () => {
    await insertVariant(database, variantId, 1, 2_900);

    await expect(
      reserve(checkoutRepository, variantId, "10000000-0000-4000-8000-00000000000c", "delivery"),
    ).rejects.toThrow("merchandise subtotal of at least $30.00");

    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 1,
      reservedQty: 0,
    });
    expect(await database.$count(inventoryReservations)).toBe(0);
    expect(await database.$count(pendingCheckouts)).toBe(0);
  });

  test("refuses to replay a checkout request under a different fulfillment method", async () => {
    await insertVariant(database, variantId, 2);

    const requestId = "10000000-0000-4000-8000-00000000000b";

    await reserve(checkoutRepository, variantId, requestId, "shipping");

    await expect(reserve(checkoutRepository, variantId, requestId, "delivery")).rejects.toThrow(
      "another fulfillment method",
    );
    // The rejected replay must not reserve a second unit.
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 2,
      reservedQty: 1,
    });
  });

  test("rejects a delivery_scheduled status on a shipping order", async () => {
    await insertVariant(database, variantId, 1);

    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-00000000000c",
    );

    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_shipping");
    await paidOrders.createPaidOrder(paidCheckout(reservation, "cs_shipping"));

    // The database, not just the application, refuses to stage a shipping order for collection.
    expect(
      await constraintViolation(() =>
        database
          .update(orders)
          .set({ status: "delivery_scheduled", deliveryScheduledAt: new Date() })
          .where(eq(orders.stripeSessionId, "cs_shipping")),
      ),
    ).toBe("orders_delivery_scheduled_requires_delivery");
  });

  test("rejects fulfilled delivery orders without a scheduling timestamp", async () => {
    await insertVariant(database, variantId, 1);

    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-00000000000d",
      "delivery",
    );

    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_delivery_direct");
    await paidOrders.createPaidOrder(paidCheckout(reservation, "cs_delivery_direct"));

    // A delivery order must pass through delivery_scheduled, so a direct jump to the terminal state
    // cannot quietly discard the record of when the delivery was scheduled.
    expect(
      await constraintViolation(() =>
        database
          .update(orders)
          .set({ status: "fulfilled" })
          .where(eq(orders.stripeSessionId, "cs_delivery_direct")),
      ),
    ).toBe("orders_delivery_scheduled_at_required");

    // With the timestamp present the same transition is accepted.
    await database
      .update(orders)
      .set({ status: "fulfilled", deliveryScheduledAt: new Date() })
      .where(eq(orders.stripeSessionId, "cs_delivery_direct"));

    const order = await database.query.orders.findFirst({
      columns: { status: true },
      where: (row, { eq: matches }) => matches(row.stripeSessionId, "cs_delivery_direct"),
    });

    expect(order?.status).toBe("fulfilled");
  });

  test("rejects scheduling a delivery order whose stock was never allocated", async () => {
    await insertVariant(database, variantId, 1);

    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-00000000000e",
      "delivery",
    );

    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_delivery_blocked");
    await paidOrders.createPaidOrder(paidCheckout(reservation, "cs_delivery_blocked"));
    await database
      .update(orders)
      .set({ inventoryStatus: "exception" })
      .where(eq(orders.stripeSessionId, "cs_delivery_blocked"));

    // An order that could not allocate stock has nothing to hand over, so it cannot be staged.
    expect(
      await constraintViolation(() =>
        database
          .update(orders)
          .set({ status: "delivery_scheduled", deliveryScheduledAt: new Date() })
          .where(eq(orders.stripeSessionId, "cs_delivery_blocked")),
      ),
    ).toBe("orders_fulfilled_inventory_resolved");

    // The same constraint guards the terminal state, so an inventory-exception order cannot slip
    // straight to fulfilled either.
    expect(
      await constraintViolation(() =>
        database
          .update(orders)
          .set({ status: "fulfilled", deliveryScheduledAt: new Date() })
          .where(eq(orders.stripeSessionId, "cs_delivery_blocked")),
      ),
    ).toBe("orders_fulfilled_inventory_resolved");
  });

  test("multi-line failures and transaction rollback never partially reserve", async () => {
    await insertVariant(database, variantId, 1);
    await insertVariant(database, secondVariantId, 0);

    await expect(
      checkoutRepository.reserveCheckout({
        requestId: "10000000-0000-4000-8000-000000000004",
        pendingCheckoutToken: "checkout_multiline_123456",
        reservationToken: "reservation_multiline_123",
        items: [
          { variantId, quantity: 1 },
          { variantId: secondVariantId, quantity: 1 },
        ],
        fulfillmentMethod: "shipping",
        expiresAt: new Date("2026-07-10T14:00:00.000Z"),
        nextReconcileAt: new Date("2026-07-10T13:05:00.000Z"),
      }),
    ).rejects.toThrow();

    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 1,
      reservedQty: 0,
    });
    expect(await database.$count(inventoryReservations)).toBe(0);
    expect(await database.$count(pendingCheckouts)).toBe(0);
  });

  test("paid conversion and expiration are each exactly once", async () => {
    await insertVariant(database, variantId, 1);
    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-000000000005",
    );
    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_test_paid");
    const checkout = paidCheckout(reservation, "cs_test_paid");

    expect(await paidOrders.createPaidOrder(checkout)).toMatchObject({ created: true });
    expect(await paidOrders.createPaidOrder(checkout)).toMatchObject({ created: false });
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 0,
      reservedQty: 0,
    });
    expect(
      await database.query.inventoryReservations.findFirst({
        columns: { status: true },
      }),
    ).toEqual({ status: "converted" });
    expect(await database.$count(orders)).toBe(1);
    expect(
      await reservationEvents.markAwaitingPayment(eventFor(reservation, "cs_test_paid")),
    ).toEqual({
      changed: false,
    });

    await resetCommerceRows(database);
    await insertVariant(database, variantId, 1);
    const expiring = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-000000000006",
    );
    await checkoutRepository.linkStripeSession(expiring.reservationToken, "cs_test_expired");
    const event = {
      pendingCheckoutToken: expiring.pendingCheckoutToken,
      reservationToken: expiring.reservationToken,
      stripeSessionId: "cs_test_expired",
    };

    expect(await reservationEvents.releaseReservation(event, "stripe_session_expired")).toEqual({
      changed: true,
    });
    expect(await reservationEvents.releaseReservation(event, "stripe_session_expired")).toEqual({
      changed: false,
    });
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 1,
      reservedQty: 0,
    });
  });

  test("a refund retained before paid-order creation releases the reservation without allocating", async () => {
    await insertVariant(database, variantId, 1);
    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-000000000015",
    );
    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_refunded_early");
    await database.insert(stripePaymentEvents).values({
      stripeEventId: "evt_refunded_before_paid_order",
      stripePaymentIntentId: "pi_cs_refunded_early",
      kind: "refund",
      refundedCents: 8900,
      currency: "cad",
      occurredAt: new Date("2026-08-27T15:00:00.000Z"),
    });

    await expect(
      paidOrders.createPaidOrder(paidCheckout(reservation, "cs_refunded_early")),
    ).resolves.toMatchObject({ created: true });

    const persistedOrder = await database.query.orders.findFirst({
      columns: { id: true, status: true, inventoryStatus: true, refundStatus: true },
    });
    expect(persistedOrder).toMatchObject({
      status: "refunded",
      inventoryStatus: "released",
      refundStatus: "full",
    });
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 1,
      reservedQty: 0,
    });
    expect(
      await database.query.inventoryReservations.findFirst({
        columns: { status: true, releaseReason: true },
      }),
    ).toEqual({ status: "released", releaseReason: "fully_refunded_before_order" });
    expect(
      await database.query.orderEmailDeliveries.findMany({
        columns: {
          kind: true,
          refundAmountCents: true,
          refundCumulativeCents: true,
        },
        where: eq(orderEmailDeliveries.orderId, persistedOrder?.id ?? ""),
        orderBy: (deliveries) => [asc(deliveries.kind)],
      }),
    ).toEqual([
      { kind: "confirmation", refundAmountCents: null, refundCumulativeCents: null },
      { kind: "refund", refundAmountCents: 8900, refundCumulativeCents: 8900 },
    ]);
  });

  test("payment racing expiration has one consistent terminal result", async () => {
    await insertVariant(database, variantId, 1);
    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-000000000007",
    );
    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_test_race");
    const event = {
      pendingCheckoutToken: reservation.pendingCheckoutToken,
      reservationToken: reservation.reservationToken,
      stripeSessionId: "cs_test_race",
    };

    await Promise.allSettled([
      paidOrders.createPaidOrder(paidCheckout(reservation, "cs_test_race")),
      reservationEvents.releaseReservation(event, "stripe_session_expired"),
    ]);

    const stock = await variantStock(database, variantId);
    const order = await database.query.orders.findFirst({
      columns: { inventoryStatus: true },
    });
    const persistedReservation = await database.query.inventoryReservations.findFirst({
      columns: { status: true },
    });

    expect(await database.$count(orders)).toBe(1);
    expect(stock).toBeDefined();

    if (!stock) {
      throw new Error("Race test variant was not found.");
    }

    expect(stock.reservedQty).toBe(0);
    expect(
      (order?.inventoryStatus === "allocated" &&
        persistedReservation?.status === "converted" &&
        stock.inventoryQty === 0) ||
        (order?.inventoryStatus === "exception" &&
          persistedReservation?.status === "released" &&
          stock.inventoryQty === 1),
    ).toBe(true);
  });

  test("a verified payment survives missing reservation state as an inventory exception", async () => {
    await insertVariant(database, variantId, 1);
    const reservation = await reserve(
      checkoutRepository,
      variantId,
      "10000000-0000-4000-8000-000000000009",
    );
    await checkoutRepository.linkStripeSession(reservation.reservationToken, "cs_test_fallback");

    // Simulate corruption after clearing the orphaned counter so the paid-event fallback is
    // exercised without manufacturing a permanent stock leak in the disposable database.
    await database.update(productVariants).set({ reservedQty: 0 });
    await database.delete(inventoryReservations);

    await expect(
      paidOrders.createPaidOrder(paidCheckout(reservation, "cs_test_fallback")),
    ).resolves.toMatchObject({ created: true });
    expect(
      await database.query.orders.findFirst({
        columns: { inventoryStatus: true },
      }),
    ).toEqual({ inventoryStatus: "exception" });
    expect(await variantStock(database, variantId)).toEqual({
      inventoryQty: 1,
      reservedQty: 0,
    });
  });

  test("database constraints block inventory reductions and deletion while reserved", async () => {
    await insertVariant(database, variantId, 1);
    await reserve(checkoutRepository, variantId, "10000000-0000-4000-8000-000000000008");

    const inventoryError = await captureDatabaseError(
      database.update(productVariants).set({ inventoryQty: 0 }).execute(),
    );
    const deleteError = await captureDatabaseError(database.delete(productVariants).execute());
    const missingSessionError = await captureDatabaseError(
      database.update(inventoryReservations).set({ status: "active" }).execute(),
    );
    const inconsistentTerminalError = await captureDatabaseError(
      database
        .update(inventoryReservations)
        .set({ status: "converted", stripeSessionId: "cs_invalid_terminal" })
        .execute(),
    );

    expect(getDatabaseErrorCode(inventoryError)).toBe("23514");
    expect(getDatabaseErrorCode(deleteError)).toBe("23503");
    expect(getDatabaseErrorCode(missingSessionError)).toBe("23514");
    expect(getDatabaseErrorCode(inconsistentTerminalError)).toBe("23514");
  });
});

async function captureDatabaseError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
    return null;
  } catch (error) {
    return error;
  }
}

function getDatabaseErrorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }

  if ("code" in error && typeof error.code === "string") {
    return error.code;
  }

  return "cause" in error ? getDatabaseErrorCode(error.cause) : null;
}

async function insertVariant(
  database: Database,
  id: string,
  inventoryQty: number,
  priceCents = 8_900,
): Promise<void> {
  await database.insert(productVariants).values({
    id,
    productId,
    name: id === variantId ? '8.25"' : '8.5"',
    sku: id === variantId ? "DECK-825" : "DECK-850",
    priceCents,
    inventoryQty,
  });
}

async function reserve(
  repository: CheckoutRepository,
  reservedVariantId: string,
  requestId: string,
  fulfillmentMethod: "shipping" | "delivery" = "shipping",
) {
  const suffix = requestId.slice(-12);

  return repository.reserveCheckout({
    requestId,
    pendingCheckoutToken: `checkout_${suffix}_abcdef`,
    reservationToken: `reservation_${suffix}_abc`,
    items: [{ variantId: reservedVariantId, quantity: 1 }],
    fulfillmentMethod,
    expiresAt: new Date("2026-07-10T14:00:00.000Z"),
    nextReconcileAt: new Date("2026-07-10T13:05:00.000Z"),
  });
}

function paidCheckout(reservation: Awaited<ReturnType<typeof reserve>>, stripeSessionId: string) {
  return {
    pendingCheckoutToken: reservation.pendingCheckoutToken,
    reservationToken: reservation.reservationToken,
    stripeSessionId,
    stripePaymentIntentId: `pi_${stripeSessionId}`,
    email: "skater@example.com",
    subtotalCents: 8900,
    taxCents: 0,
    shippingCents: 0,
    totalCents: 8900,
    currency: "cad",
    shippingAddress: null,
    destinationProvince: null,
  };
}

function eventFor(reservation: Awaited<ReturnType<typeof reserve>>, stripeSessionId: string) {
  return {
    pendingCheckoutToken: reservation.pendingCheckoutToken,
    reservationToken: reservation.reservationToken,
    stripeSessionId,
  };
}

/** Returns the violated constraint name, which Drizzle only exposes on the wrapped cause. */
async function constraintViolation(run: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await run();
  } catch (error) {
    return (error as { cause?: { constraint_name?: string } }).cause?.constraint_name;
  }

  return undefined;
}

async function variantStock(database: Database, id: string) {
  return database.query.productVariants.findFirst({
    columns: { inventoryQty: true, reservedQty: true },
    where: (variants, { eq }) => eq(variants.id, id),
  });
}

async function resetCommerceRows(database: Database): Promise<void> {
  await database.delete(orders);
  await database.delete(inventoryReservations);
  await database.delete(pendingCheckouts);
  await database.delete(productVariants);
}

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
  `create table shipping_rates (
    profile text primary key,
    rate_cents integer not null check (rate_cents >= 0),
    updated_at timestamptz not null default now()
  )`,
  `insert into shipping_rates (profile, rate_cents) values
    ('flat', 300),
    ('softgood', 1200),
    ('deck', 2200)`,
  `create table product_variants (
    id uuid primary key,
    product_id uuid not null references products(id) on delete cascade,
    name text not null,
    sku text not null unique,
    price_cents integer not null check (price_cents >= 0),
    inventory_qty integer not null default 0 check (inventory_qty >= 0),
    reserved_qty integer not null default 0 check (
      reserved_qty >= 0 and reserved_qty <= inventory_qty
    ),
    position integer not null default 0 check (position >= 0)
  )`,
  `create table pending_checkouts (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    items jsonb not null,
    line_items jsonb,
    fulfillment_method text not null default 'shipping',
    stripe_session_id text unique,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null,
    completed_at timestamptz
  )`,
  `create table inventory_reservations (
    id uuid primary key default gen_random_uuid(),
    token text not null unique,
    request_id uuid not null unique,
    pending_checkout_id uuid not null unique references pending_checkouts(id) on delete restrict,
    stripe_session_id text unique,
    stripe_create_idempotency_key text not null unique,
    stripe_session_params jsonb,
    status text not null default 'provisioning',
    expires_at timestamptz not null,
    converted_at timestamptz,
    released_at timestamptz,
    release_reason text,
    next_reconcile_at timestamptz not null,
    reconcile_lease_until timestamptz,
    reconcile_attempt_count integer not null default 0,
    last_reconcile_error_code text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint inventory_reservations_terminal_state_consistent check (
      (
        status = 'converted'
        and converted_at is not null
        and released_at is null
        and release_reason is null
      ) or (
        status = 'released'
        and converted_at is null
        and released_at is not null
        and release_reason is not null
      ) or (
        status in ('provisioning', 'active', 'awaiting_payment')
        and converted_at is null
        and released_at is null
        and release_reason is null
      )
    ),
    constraint inventory_reservations_linked_state_has_session check (
      status not in ('active', 'awaiting_payment', 'converted') or stripe_session_id is not null
    )
  )`,
  `create table inventory_reservation_items (
    id uuid primary key default gen_random_uuid(),
    reservation_id uuid not null references inventory_reservations(id) on delete cascade,
    variant_id uuid references product_variants(id) on delete restrict,
    variant_id_snapshot uuid not null,
    quantity integer not null check (quantity > 0),
    unique (reservation_id, variant_id_snapshot)
  )`,
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
    total_cents integer not null,
    currency text not null,
    shipping_address jsonb,
    destination_province text,
    created_at timestamptz not null default now(),
    constraint orders_delivery_scheduled_requires_delivery check (
      status <> 'delivery_scheduled' or fulfillment_method = 'delivery'
    ),
    constraint orders_delivery_scheduled_at_required check (
      status not in ('delivery_scheduled', 'fulfilled')
      or fulfillment_method <> 'delivery'
      or delivery_scheduled_at is not null
    ),
    -- Mirrors production: terminal and staged orders may be allocated or returned after refund,
    -- but they may never carry an unresolved inventory exception.
    constraint orders_fulfilled_inventory_resolved check (
      status not in ('fulfilled', 'delivery_scheduled')
      or inventory_status in ('allocated', 'released')
    ),
    constraint orders_released_inventory_requires_refund check (
      inventory_status <> 'released' or refund_status <> 'none'
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
  `create table order_items (
    id uuid primary key default gen_random_uuid(),
    order_id uuid not null references orders(id) on delete cascade,
    variant_id uuid references product_variants(id) on delete set null,
    product_name_snapshot text not null,
    variant_name_snapshot text not null,
    unit_price_cents_snapshot integer not null,
    quantity integer not null
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
