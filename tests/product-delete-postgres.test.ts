import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "@/lib/db/client";
import { orderItems, productImages, products, productVariants } from "@/lib/db/schema";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const schemaName = `product_delete_test_${crypto.randomUUID().replaceAll("-", "")}`;
const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";
const variantId = "10000000-0000-4000-8000-000000000001";
const imageId = "20000000-0000-4000-8000-000000000001";
const orderId = "30000000-0000-4000-8000-000000000001";
const reservationId = "40000000-0000-4000-8000-000000000001";

mock.module("server-only", () => ({}));

describe.skipIf(!testDatabaseUrl)("guarded product deletion with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let database: Database;
  let deleteProductRecord: typeof import("@/lib/admin/product-repository").deleteProductRecord;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    adminClient = postgres(testDatabaseUrl, { max: 1, prepare: false });
    await adminClient.unsafe(`create schema "${schemaName}"`);
    client = postgres(testDatabaseUrl, {
      max: 5,
      prepare: false,
      connection: { search_path: schemaName },
    });

    await client.unsafe(`
      create table products (
        id uuid primary key,
        slug text not null,
        name text not null,
        description text,
        category text not null,
        subcategory text not null,
        status text not null,
        created_at timestamp with time zone not null default now(),
        updated_at timestamp with time zone not null default now()
      )
    `);
    await client.unsafe(`
      create table product_variants (
        id uuid primary key,
        product_id uuid not null references products(id) on delete cascade,
        name text not null,
        sku text not null,
        price_cents integer not null,
        inventory_qty integer not null default 0,
        reserved_qty integer not null default 0,
        position integer not null default 0
      )
    `);
    await client.unsafe(`
      create table product_images (
        id uuid primary key,
        product_id uuid not null references products(id) on delete cascade,
        url text not null,
        alt text,
        position integer not null default 0
      )
    `);
    await client.unsafe(`
      create table order_items (
        id uuid primary key,
        order_id uuid not null,
        variant_id uuid references product_variants(id) on delete set null,
        product_name_snapshot text not null,
        variant_name_snapshot text not null,
        unit_price_cents_snapshot integer not null,
        quantity integer not null
      )
    `);
    await client.unsafe(`
      create table inventory_reservations (
        id uuid primary key
      )
    `);
    await client.unsafe(`
      create table inventory_reservation_items (
        id uuid primary key,
        reservation_id uuid not null references inventory_reservations(id) on delete cascade,
        variant_id uuid references product_variants(id) on delete restrict,
        variant_id_snapshot uuid not null,
        quantity integer not null
      )
    `);

    database = drizzle(client, {
      schema: await import("@/lib/db/schema"),
    });
    ({ deleteProductRecord } = await import("@/lib/admin/product-repository"));
  });

  beforeEach(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.unsafe(`
      truncate table
        inventory_reservation_items,
        inventory_reservations,
        order_items,
        product_images,
        product_variants,
        products
      cascade
    `);
    await database.insert(products).values({
      id: productId,
      slug: "database-deck",
      name: "Database Deck",
      category: "hardgoods",
      subcategory: "decks",
      status: "draft",
    });
    await database.insert(productVariants).values({
      id: variantId,
      productId,
      name: '8.25"',
      sku: "DECK-DB-825",
      priceCents: 8900,
      inventoryQty: 5,
    });
    await database.insert(productImages).values({
      id: imageId,
      productId,
      url: "https://images.example/deck-front.webp",
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

  test("deletes a draft product with no history and reports its image urls", async () => {
    await expect(deleteProductRecord(database, productId)).resolves.toEqual({
      outcome: "deleted",
      slug: "database-deck",
      imageUrls: ["https://images.example/deck-front.webp"],
    });

    expect(await database.select().from(products)).toHaveLength(0);
    expect(await database.select().from(productVariants)).toHaveLength(0);
    expect(await database.select().from(productImages)).toHaveLength(0);
  });

  test("refuses to delete an active product", async () => {
    await database.update(products).set({ status: "active" }).where(eq(products.id, productId));

    await expect(deleteProductRecord(database, productId)).resolves.toEqual({
      outcome: "active",
    });
    expect(await database.select().from(products)).toHaveLength(1);
  });

  test("returns not_found for an unknown product id", async () => {
    await expect(
      deleteProductRecord(database, "00000000-0000-4000-8000-000000000009"),
    ).resolves.toEqual({ outcome: "not_found" });
  });

  test("refuses to delete a product whose variant appears on an order", async () => {
    await database.insert(orderItems).values({
      id: "30000000-0000-4000-8000-000000000101",
      orderId,
      variantId,
      productNameSnapshot: "Database Deck",
      variantNameSnapshot: '8.25"',
      unitPriceCentsSnapshot: 8900,
      quantity: 1,
    });

    await expect(deleteProductRecord(database, productId)).resolves.toEqual({
      outcome: "has_commerce_history",
    });
    expect(await database.select().from(products)).toHaveLength(1);
    expect(await database.select().from(productVariants)).toHaveLength(1);
  });

  test("refuses to delete a product whose variant has any reservation item, even settled ones", async () => {
    await client.unsafe(`insert into inventory_reservations (id) values ('${reservationId}')`);
    await client.unsafe(`
      insert into inventory_reservation_items
        (id, reservation_id, variant_id, variant_id_snapshot, quantity)
      values
        ('40000000-0000-4000-8000-000000000101', '${reservationId}', '${variantId}', '${variantId}', 1)
    `);

    await expect(deleteProductRecord(database, productId)).resolves.toEqual({
      outcome: "has_commerce_history",
    });
    expect(await database.select().from(products)).toHaveLength(1);
  });

  test("refuses to delete a product while a variant holds reserved inventory", async () => {
    await database
      .update(productVariants)
      .set({ reservedQty: 2 })
      .where(eq(productVariants.id, variantId));

    await expect(deleteProductRecord(database, productId)).resolves.toEqual({
      outcome: "has_commerce_history",
    });
    expect(await database.select().from(products)).toHaveLength(1);
  });

  test("serializes product deletion with a concurrent order-item insert", async () => {
    // An order-item insert holds a KEY SHARE lock on the referenced variant
    // until its transaction ends. Hold one open, start the delete against it,
    // then commit: the delete must wait on the variant locks and refuse once
    // it sees the committed row — never cascade past it into a set-null
    // orphan. Both operations succeeding would be the regression.
    let releaseInsert!: () => void;
    const insertHeld = new Promise<void>((resolve) => {
      releaseInsert = resolve;
    });
    let insertRan!: () => void;
    const insertRanSignal = new Promise<void>((resolve) => {
      insertRan = resolve;
    });

    const insertTransaction = client.begin(async (transaction) => {
      await transaction`
        insert into order_items
          (id, order_id, variant_id, product_name_snapshot, variant_name_snapshot,
           unit_price_cents_snapshot, quantity)
        values
          ('30000000-0000-4000-8000-000000000102', ${orderId}, ${variantId},
           'Database Deck', '8.25"', 8900, 1)
      `;
      insertRan();
      await insertHeld;
    });

    await insertRanSignal;
    const deletePromise = deleteProductRecord(database, productId);
    // Give the delete time to reach the variant locks and block on them.
    await new Promise((resolve) => setTimeout(resolve, 100));
    releaseInsert();
    await insertTransaction;

    await expect(deletePromise).resolves.toEqual({ outcome: "has_commerce_history" });
    expect(await database.select().from(products)).toHaveLength(1);
    expect(await database.select().from(orderItems)).toHaveLength(1);
  });

  test("an archived product with no history can be deleted", async () => {
    await database.update(products).set({ status: "archived" }).where(eq(products.id, productId));

    await expect(deleteProductRecord(database, productId)).resolves.toMatchObject({
      outcome: "deleted",
    });
    expect(await database.select().from(products)).toHaveLength(0);
  });
});
