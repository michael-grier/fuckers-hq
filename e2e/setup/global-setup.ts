import { execSync } from "node:child_process";

// CommonJS default import: @next/env exposes no named ESM exports under Node's loader.
import nextEnv from "@next/env";

/**
 * Refuses to run against anything that looks like a live environment. Exported separately from
 * the Playwright hook so the guard logic itself is unit-testable (tests/e2e-guardrails.test.ts).
 *
 * The database check is an explicit opt-in: seeding mutates catalog rows, so E2E_DATABASE_URL
 * must name the same database as DATABASE_URL to prove the target is a disposable test database.
 * `setup:worktree` writes the opt-in into the generated `.env.development.local` because a
 * worktree's Neon branch is disposable by construction; anywhere else it is a deliberate,
 * manual decision.
 */
export function assertE2eGuardrails(env: NodeJS.ProcessEnv): void {
  const stripeKey = env.STRIPE_SECRET_KEY;
  if (stripeKey && !stripeKey.startsWith("sk_test_")) {
    throw new Error(
      "E2E guardrail: STRIPE_SECRET_KEY is not a test-mode key (sk_test_...). Refusing to run.",
    );
  }

  const clerkKey = env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (clerkKey && !clerkKey.startsWith("pk_test_")) {
    throw new Error(
      "E2E guardrail: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not a development-instance key (pk_test_...). Refusing to run.",
    );
  }

  const baseURL = new URL(env.E2E_BASE_URL ?? "http://localhost:3000");
  if (baseURL.hostname !== "localhost" && baseURL.hostname !== "127.0.0.1") {
    throw new Error(
      `E2E guardrail: base URL ${baseURL.origin} is not a loopback address. Refusing to run.`,
    );
  }

  if (!env.DATABASE_URL || env.DATABASE_URL !== env.E2E_DATABASE_URL) {
    throw new Error(
      "E2E guardrail: the suite seeds and mutates its database, so E2E_DATABASE_URL must be set " +
        "to the exact DATABASE_URL of a disposable test database. Worktrees get this from " +
        "`bun run setup:worktree`; elsewhere, set it deliberately. Refusing to run.",
    );
  }
}

/**
 * Safety guardrails plus test-data seeding, run once before any spec. The guardrails are what
 * make this suite safe to run unattended: a misconfigured shell cannot point browser automation
 * at real money, real users, or a real catalog. Seeding runs afterward so specs always see the
 * same fixtures regardless of what earlier runs mutated.
 */
export default function globalSetup(): void {
  // Playwright runs outside Next.js, so load the same .env / .env*.local files the app reads.
  nextEnv.loadEnvConfig(process.cwd());

  assertE2eGuardrails(process.env);

  // Reset the catalog to a known state. Both seeds upsert by slug/SKU, so this also restores
  // inventory that earlier runs consumed.
  execSync("bun run db:seed", { stdio: "inherit" });
  execSync("bun run e2e/setup/seed-e2e.ts", { stdio: "inherit" });
}
