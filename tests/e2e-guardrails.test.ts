import { describe, expect, test } from "bun:test";

import { assertE2eGuardrails, assertLiveTierOrigin } from "@/e2e/setup/global-setup";

// A fully safe environment; each case below breaks exactly one property of it.
function safeEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    STRIPE_SECRET_KEY: "sk_test_123",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_123",
    DATABASE_URL: "postgres://u:p@host/e2e-db",
    E2E_DATABASE_URL: "postgres://u:p@host/e2e-db",
  };
}

describe("assertE2eGuardrails", () => {
  test.each(["RESEND_API_KEY", "SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN", "SENTRY_AUTH_TOKEN"])(
    "rejects inherited notification configuration in %s",
    (key) => {
      expect(() => assertE2eGuardrails({ ...safeEnv(), [key]: "configured" })).toThrow(key);
    },
  );

  test("accepts a fully test-scoped environment", () => {
    expect(() => assertE2eGuardrails(safeEnv())).not.toThrow();
  });

  test("rejects a live-mode Stripe key", () => {
    const env = { ...safeEnv(), STRIPE_SECRET_KEY: "sk_live_123" };
    expect(() => assertE2eGuardrails(env)).toThrow(/STRIPE_SECRET_KEY/);
  });

  test("rejects a production Clerk publishable key", () => {
    const env = { ...safeEnv(), NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_live_123" };
    expect(() => assertE2eGuardrails(env)).toThrow(/CLERK/);
  });

  test("rejects a non-loopback base URL", () => {
    const env = { ...safeEnv(), E2E_BASE_URL: "https://fuckershq.com" };
    expect(() => assertE2eGuardrails(env)).toThrow(/loopback/);
  });

  test("rejects a database without the explicit e2e opt-in", () => {
    const env = { ...safeEnv(), E2E_DATABASE_URL: undefined };
    expect(() => assertE2eGuardrails(env)).toThrow(/E2E_DATABASE_URL/);
  });

  test("rejects a database that does not match the opt-in", () => {
    const env = { ...safeEnv(), DATABASE_URL: "postgres://u:p@host/some-other-db" };
    expect(() => assertE2eGuardrails(env)).toThrow(/E2E_DATABASE_URL/);
  });
});

describe("assertLiveTierOrigin", () => {
  const appUrl = { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "http://localhost:3000" } as const;

  test("rejects a live run on a port other than the app URL's", () => {
    const env = { ...appUrl, E2E_STRIPE_LIVE: "1", E2E_BASE_URL: "http://localhost:4317" };
    expect(() => assertLiveTierOrigin(env)).toThrow(/E2E_BASE_URL=http:\/\/localhost:3000/);
  });

  test("accepts a live run on the app URL's origin", () => {
    const env = { ...appUrl, E2E_STRIPE_LIVE: "1", E2E_BASE_URL: "http://localhost:3000" };
    expect(() => assertLiveTierOrigin(env)).not.toThrow();
  });

  test("leaves the deterministic tiers free to use any port", () => {
    expect(() =>
      assertLiveTierOrigin({ ...appUrl, E2E_BASE_URL: "http://localhost:4317" }),
    ).not.toThrow();
  });
});
