import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const schemaName = `destination_province_test_${crypto.randomUUID().replaceAll("-", "")}`;

/** Exercises migration 0017's guarded address backfill against real Postgres JSON operators. */
describe.skipIf(!testDatabaseUrl)("destination province migration with real Postgres", () => {
  let adminClient: ReturnType<typeof postgres>;
  let client: ReturnType<typeof postgres>;

  beforeAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    adminClient = postgres(testDatabaseUrl, { max: 1, prepare: false });
    await adminClient.unsafe(`create schema "${schemaName}"`);
    const scopedUrl = new URL(testDatabaseUrl);
    scopedUrl.hostname = scopedUrl.hostname.replace("-pooler.", ".");
    scopedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
    client = postgres(scopedUrl.toString(), { max: 1, prepare: false });

    await client.unsafe(`
      create table orders (
        id uuid primary key,
        fulfillment_method text not null,
        shipping_address jsonb,
        created_at timestamptz not null default now()
      )
    `);
    await client.unsafe(`
      create table order_shipping_payment_requests (
        order_id uuid not null references orders(id),
        generation integer not null,
        status text not null,
        shipping_address jsonb
      )
    `);
  });

  afterAll(async () => {
    if (!testDatabaseUrl) {
      return;
    }

    await client.end({ timeout: 5 });
    await adminClient.unsafe(`drop schema if exists "${schemaName}" cascade`);
    await adminClient.end({ timeout: 5 });
  });

  test("backfills valid Canadian destinations and prefers final paid shipping", async () => {
    await client.unsafe(`
      insert into orders (id, fulfillment_method, shipping_address) values
        ('00000000-0000-4000-8000-000000000001', 'shipping',
          '{"address":{"country":"ca","state":"sk"}}'),
        ('00000000-0000-4000-8000-000000000002', 'shipping',
          '{"address":{"country":"CA","state":"AB"}}'),
        ('00000000-0000-4000-8000-000000000003', 'shipping',
          '{"address":{"country":"US","state":"CA"}}'),
        ('00000000-0000-4000-8000-000000000004', 'delivery',
          '{"address":{"country":"CA","state":"Alberta"}}')
    `);
    await client.unsafe(`
      insert into order_shipping_payment_requests
        (order_id, generation, status, shipping_address)
      values
        ('00000000-0000-4000-8000-000000000002', 1, 'paid',
          '{"address":{"country":"CA","state":"MB"}}')
    `);

    const migration = readFileSync("drizzle/0017_quiet_viper.sql", "utf8");
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim()) {
        await client.unsafe(statement);
      }
    }

    const rows = await client<{ id: string; destination_province: string | null }[]>`
      select id, destination_province from orders order by id
    `;
    expect([...rows]).toEqual([
      { id: "00000000-0000-4000-8000-000000000001", destination_province: "SK" },
      { id: "00000000-0000-4000-8000-000000000002", destination_province: "MB" },
      { id: "00000000-0000-4000-8000-000000000003", destination_province: null },
      { id: "00000000-0000-4000-8000-000000000004", destination_province: null },
    ]);

    const constraints = await client<{ conname: string }[]>`
        select constraints.conname
        from pg_constraint as constraints
        join pg_namespace as namespaces on namespaces.oid = constraints.connamespace
        where constraints.conname = 'orders_destination_province_valid'
          and namespaces.nspname = current_schema()
    `;
    expect([...constraints]).toEqual([{ conname: "orders_destination_province_valid" }]);

    let constraintError: unknown;
    try {
      await client`
        update orders
        set destination_province = 'XX'
        where id = '00000000-0000-4000-8000-000000000001'
      `;
    } catch (error) {
      constraintError = error;
    }
    expect(constraintError).toMatchObject({
      code: "23514",
      constraint_name: "orders_destination_province_valid",
    });
  }, 30_000);
});
