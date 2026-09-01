import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import postgres from "postgres";

const testDatabaseUrl = process.env.RESERVATION_TEST_DATABASE_URL;
const unpooledTestDatabaseUrl = testDatabaseUrl ? toUnpooledNeonUrl(testDatabaseUrl) : undefined;
const schemaName = `delivery_review_contract_test_${crypto.randomUUID().replaceAll("-", "")}`;
const migrationStatements = readFileSync("drizzle/0018_delivery-review-contract.sql", "utf8")
  .split("--> statement-breakpoint")
  .filter((statement) => statement.trim());

/** Exercises the contract migration against the expand-phase trigger and real Postgres checks. */
describe.skipIf(!unpooledTestDatabaseUrl)(
  "delivery review contract migration with real Postgres",
  () => {
    let adminClient: ReturnType<typeof postgres>;
    let client: ReturnType<typeof postgres>;

    beforeAll(async () => {
      if (!unpooledTestDatabaseUrl) {
        return;
      }

      adminClient = postgres(unpooledTestDatabaseUrl, { max: 1, prepare: false });
      await adminClient.unsafe(`create schema "${schemaName}"`);
      const scopedUrl = new URL(unpooledTestDatabaseUrl);
      scopedUrl.searchParams.set("options", `-csearch_path=${schemaName}`);
      client = postgres(scopedUrl.toString(), { max: 1, prepare: false });
    });

    beforeEach(async () => {
      if (!unpooledTestDatabaseUrl) {
        return;
      }

      await adminClient.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await adminClient.unsafe(`create schema "${schemaName}"`);

      for (const statement of expandPhaseSchema) {
        await client.unsafe(statement);
      }
    });

    afterAll(async () => {
      if (!unpooledTestDatabaseUrl) {
        return;
      }

      await client.end({ timeout: 5 });
      await adminClient.unsafe(`drop schema if exists "${schemaName}" cascade`);
      await adminClient.end({ timeout: 5 });
    });

    test("validates existing rows before removing the compatibility bridge", async () => {
      await client.unsafe(`
        insert into orders (fulfillment_method, status, delivery_review_status) values
          ('shipping', 'paid', null),
          ('delivery', 'paid', 'pending'),
          ('delivery', 'delivery_scheduled', 'approved'),
          ('shipping', 'paid', 'shipping_payment_received'),
          ('shipping', 'paid', 'shipping_payment_exception')
      `);

      await applyMigration();

      const constraints = await client<{ conname: string; convalidated: boolean }[]>`
        select constraints.conname, constraints.convalidated
        from pg_constraint as constraints
        join pg_namespace as namespaces on namespaces.oid = constraints.connamespace
        where namespaces.nspname = current_schema()
          and constraints.conname in (
            'orders_delivery_review_method_consistent',
            'orders_delivery_scheduling_requires_approval'
          )
        order by constraints.conname
      `;
      expect([...constraints]).toEqual([
        { conname: "orders_delivery_review_method_consistent", convalidated: true },
        { conname: "orders_delivery_scheduling_requires_approval", convalidated: true },
      ]);
      expect(await bridgeObjects()).toEqual({ functions: 0, triggers: 0 });

      await expectConstraintViolation(
        "insert into orders (fulfillment_method, status, delivery_review_status) values ('delivery', 'paid', null)",
        "orders_delivery_review_method_consistent",
      );
      await expectConstraintViolation(
        "insert into orders (fulfillment_method, status, delivery_review_status) values ('shipping', 'paid', 'pending')",
        "orders_delivery_review_method_consistent",
      );
      await expectConstraintViolation(
        "insert into orders (fulfillment_method, status, delivery_review_status) values ('delivery', 'delivery_scheduled', 'pending')",
        "orders_delivery_scheduling_requires_approval",
      );
    });

    test("aborts without removing the bridge when existing state is invalid", async () => {
      await client.unsafe(`
        insert into orders (fulfillment_method, status, delivery_review_status)
        values ('shipping', 'paid', 'pending')
      `);

      const migrationError = await captureError(applyMigration);

      expect(migrationError).toMatchObject({
        code: "23514",
        constraint_name: "orders_delivery_review_method_consistent",
      });
      expect(await bridgeObjects()).toEqual({ functions: 1, triggers: 1 });
      const constraints = await client<{ count: number }[]>`
        select count(*)::int as count
        from pg_constraint as constraints
        join pg_namespace as namespaces on namespaces.oid = constraints.connamespace
        where namespaces.nspname = current_schema()
          and constraints.conname in (
            'orders_delivery_review_method_consistent',
            'orders_delivery_scheduling_requires_approval'
          )
      `;
      expect(constraints[0]?.count).toBe(0);
      const [unexpectedOrder] = await client<{ delivery_review_status: string | null }[]>`
        select delivery_review_status from orders
      `;
      expect(unexpectedOrder?.delivery_review_status).toBe("pending");
    });

    /** Applies every migration statement atomically, matching the production migrator. */
    async function applyMigration(): Promise<void> {
      await client.begin(async (transaction) => {
        for (const statement of migrationStatements) {
          await transaction.unsafe(statement);
        }
      });
    }

    /** Counts the temporary objects without exposing any order data. */
    async function bridgeObjects(): Promise<{ functions: number; triggers: number }> {
      const [row] = await client<{ functions: number; triggers: number }[]>`
        select
          (
            select count(*)::int
            from pg_proc as functions
            join pg_namespace as namespaces on namespaces.oid = functions.pronamespace
            where namespaces.nspname = current_schema()
              and functions.proname = 'set_legacy_delivery_review_status'
          ) as functions,
          (
            select count(*)::int
            from pg_trigger as triggers
            join pg_class as tables on tables.oid = triggers.tgrelid
            join pg_namespace as namespaces on namespaces.oid = tables.relnamespace
            where namespaces.nspname = current_schema()
              and triggers.tgname = 'orders_legacy_delivery_review_status'
              and not triggers.tgisinternal
          ) as triggers
      `;

      return row ?? { functions: 0, triggers: 0 };
    }

    /** Proves the named Postgres constraint rejects one new invalid state. */
    async function expectConstraintViolation(statement: string, constraintName: string) {
      const error = await captureError(() => client.unsafe(statement));

      expect(error).toMatchObject({ code: "23514", constraint_name: constraintName });
    }
  },
);

/** Returns a rejected database operation's error without weakening its unknown boundary. */
async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }

  throw new Error("Expected the database operation to fail.");
}

/** Neon poolers reject startup `search_path`; the direct endpoint accepts the isolated schema. */
function toUnpooledNeonUrl(value: string): string {
  const url = new URL(value);
  url.hostname = url.hostname.replace("-pooler.", ".");
  return url.toString();
}

const expandPhaseSchema = [
  `create type fulfillment_method as enum ('shipping', 'delivery')`,
  `create type order_status as enum (
    'pending', 'paid', 'delivery_scheduled', 'fulfilled', 'cancelled', 'refunded'
  )`,
  `create type delivery_review_status as enum (
    'pending', 'approved', 'shipping_payment_pending',
    'shipping_payment_received', 'shipping_payment_exception'
  )`,
  `create table orders (
    id integer generated always as identity primary key,
    fulfillment_method fulfillment_method not null,
    status order_status not null,
    delivery_review_status delivery_review_status
  )`,
  `create function set_legacy_delivery_review_status() returns trigger as $$
  begin
    if new.fulfillment_method = 'delivery' and new.delivery_review_status is null then
      new.delivery_review_status := case
        when new.status::text = 'paid' then 'pending'::delivery_review_status
        else 'approved'::delivery_review_status
      end;
    elsif new.fulfillment_method = 'delivery'
      and new.status::text = 'delivery_scheduled'
      and new.delivery_review_status::text = 'pending' then
      new.delivery_review_status := 'approved'::delivery_review_status;
    end if;
    return new;
  end;
  $$ language plpgsql`,
  `create trigger orders_legacy_delivery_review_status
    before insert or update of fulfillment_method, status, delivery_review_status on orders
    for each row execute function set_legacy_delivery_review_status()`,
];
