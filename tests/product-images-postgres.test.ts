import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import type { Database } from "@/lib/db/client";
import { productImages, products } from "@/lib/db/schema";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const schemaName = `product_image_test_${crypto.randomUUID().replaceAll("-", "")}`;
const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";
const firstImageId = "10000000-0000-4000-8000-000000000001";
const secondImageId = "10000000-0000-4000-8000-000000000002";
const thirdImageId = "10000000-0000-4000-8000-000000000003";

mock.module("server-only", () => ({}));

describe.skipIf(!testDatabaseUrl)("product image deletion with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;
  let database: Database;
  let deleteProductImageRecord: typeof import("@/lib/admin/product-image-repository").deleteProductImageRecord;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    adminClient = postgres(testDatabaseUrl, { max: 1, prepare: false });
    await adminClient.unsafe(`create schema "${schemaName}"`);
    client = postgres(testDatabaseUrl, {
      max: 1,
      prepare: false,
      connection: { search_path: schemaName },
    });

    await client.unsafe(`
      create table products (
        id uuid primary key,
        slug text not null,
        name text not null,
        status text not null
      )
    `);
    await client.unsafe(`
      create table product_images (
        id uuid primary key,
        product_id uuid not null references products(id) on delete cascade,
        url text not null,
        alt text,
        position integer not null check (position >= 0)
      )
    `);

    database = drizzle(client, {
      schema: await import("@/lib/db/schema"),
    });
    ({ deleteProductImageRecord } = await import("@/lib/admin/product-image-repository"));
  });

  beforeEach(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.unsafe("drop trigger if exists reject_image_reposition on product_images");
    await client.unsafe("drop function if exists reject_image_reposition()");
    await client.unsafe("truncate table product_images, products cascade");
    await database.insert(products).values({
      id: productId,
      slug: "database-deck",
      name: "Database Deck",
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

  test("deletes an image and compacts every remaining position from zero", async () => {
    await insertImages([
      { id: firstImageId, position: 0 },
      { id: secondImageId, position: 1 },
      { id: thirdImageId, position: 3 },
    ]);

    await expect(deleteProductImageRecord(database, productId, firstImageId)).resolves.toEqual({
      slug: "database-deck",
      url: `https://images.example/${firstImageId}.webp`,
    });

    expect(await imagePositions()).toEqual([
      { id: secondImageId, position: 0 },
      { id: thirdImageId, position: 1 },
    ]);
  });

  test("rolls back the deletion when position compaction fails", async () => {
    await insertImages([
      { id: firstImageId, position: 0 },
      { id: secondImageId, position: 1 },
    ]);
    await client.unsafe(`
      create function reject_image_reposition() returns trigger as $$
      begin
        raise exception 'position update rejected';
      end;
      $$ language plpgsql
    `);
    await client.unsafe(`
      create trigger reject_image_reposition
      before update of position on product_images
      for each row execute function reject_image_reposition()
    `);

    await expect(deleteProductImageRecord(database, productId, firstImageId)).rejects.toThrow(
      "position update rejected",
    );
    expect(await imagePositions()).toEqual([
      { id: firstImageId, position: 0 },
      { id: secondImageId, position: 1 },
    ]);
  });

  async function insertImages(images: Array<{ id: string; position: number }>): Promise<void> {
    await database.insert(productImages).values(
      images.map((image) => ({
        ...image,
        productId,
        url: `https://images.example/${image.id}.webp`,
      })),
    );
  }

  async function imagePositions(): Promise<Array<{ id: string; position: number }>> {
    return database
      .select({
        id: productImages.id,
        position: productImages.position,
      })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(asc(productImages.position), asc(productImages.id));
  }
});
