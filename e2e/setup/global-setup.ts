import { execSync } from "node:child_process";

// CommonJS default import: @next/env exposes no named ESM exports under Node's loader.
import nextEnv from "@next/env";

/**
 * Safety guardrails plus test-data seeding, run once before any spec.
 *
 * The guardrails are what make this suite safe to run unattended: they refuse to start against
 * anything that looks like a live environment, so a misconfigured shell cannot point browser
 * automation at real money or real users. Seeding runs afterward so specs always see the same
 * catalog regardless of what earlier runs mutated.
 */
export default function globalSetup(): void {
  // Playwright runs outside Next.js, so load the same .env / .env*.local files the app reads.
  nextEnv.loadEnvConfig(process.cwd());

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (stripeKey && !stripeKey.startsWith("sk_test_")) {
    throw new Error(
      "E2E guardrail: STRIPE_SECRET_KEY is not a test-mode key (sk_test_...). Refusing to run.",
    );
  }

  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (clerkKey && !clerkKey.startsWith("pk_test_")) {
    throw new Error(
      "E2E guardrail: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not a development-instance key (pk_test_...). Refusing to run.",
    );
  }

  const baseURL = new URL(process.env.E2E_BASE_URL ?? "http://localhost:3000");
  if (baseURL.hostname !== "localhost" && baseURL.hostname !== "127.0.0.1") {
    throw new Error(
      `E2E guardrail: base URL ${baseURL.origin} is not a loopback address. Refusing to run.`,
    );
  }

  // Reset the catalog to a known state. Both seeds upsert by slug/SKU, so this also restores
  // inventory that earlier runs consumed.
  execSync("bun run db:seed", { stdio: "inherit" });
  execSync("bun run e2e/setup/seed-e2e.ts", { stdio: "inherit" });
}
