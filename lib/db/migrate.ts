import { readFileSync } from "node:fs";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

import { env } from "@/lib/env";

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run migrations.");
}

const migrationClient = postgres(env.DATABASE_URL, {
  max: 1,
  prepare: false,
});

// Lists what is about to run so deploy logs record exactly which migrations reached the target
// database. Mirrors the drizzle migrator's own pending check: an entry is pending when its
// journal timestamp is newer than the last row in drizzle.__drizzle_migrations. Advisory only —
// the migrator below remains the authority on what actually applies.
async function listPendingMigrations(): Promise<string[]> {
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
    entries: { when: number; tag: string }[];
  };

  const [migrationsTable] = await migrationClient<{ name: string | null }[]>`
    SELECT to_regclass('drizzle.__drizzle_migrations')::text AS name
  `;

  let lastApplied = 0;
  if (migrationsTable?.name != null) {
    const [row] = await migrationClient<{ last: string | null }[]>`
      SELECT max(created_at)::text AS last FROM drizzle.__drizzle_migrations
    `;
    lastApplied = Number(row?.last ?? 0);
  }

  return journal.entries.filter((entry) => entry.when > lastApplied).map((entry) => entry.tag);
}

try {
  const pending = await listPendingMigrations();

  if (pending.length === 0) {
    console.log("No pending migrations.");
  } else {
    console.log(`Applying ${pending.length} pending migration(s):`);
    for (const tag of pending) {
      console.log(`  - ${tag}`);
    }
  }

  await migrate(drizzle(migrationClient), {
    migrationsFolder: "drizzle",
  });
  console.log(pending.length === 0 ? "Database is up to date." : "Migrations applied.");
} finally {
  await migrationClient.end();
}
