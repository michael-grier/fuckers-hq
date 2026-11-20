import { describe, expect, test } from "bun:test";
import { isSentryEnabled } from "@/lib/observability/sentry-enabled";
import { sentryDataCollection, sentryEnvironment } from "@/lib/observability/sentry-options";
import {
  getServerExceptionTags,
  normalizeServerException,
} from "@/lib/observability/server-context";

describe("server error capture contract", () => {
  test("builds only stable non-customer tags", () => {
    expect(
      getServerExceptionTags({
        area: "checkout",
        operation: "checkout.create-session",
      }),
    ).toEqual({
      "app.area": "checkout",
      "app.operation": "checkout.create-session",
    });
  });

  test("preserves Error instances", () => {
    const error = new Error("Stripe request failed.");

    expect(normalizeServerException(error)).toBe(error);
  });

  test("does not serialize unknown thrown values", () => {
    const error = normalizeServerException({ secret: "must-not-be-captured" });

    expect(error.message).toBe("A non-Error value was thrown.");
    expect(error.message).not.toContain("must-not-be-captured");
  });
});

describe("sentry enablement gate", () => {
  const dsn = "https://public@o0.ingest.us.sentry.io/0";

  test("reports from production deployments with a DSN", () => {
    expect(isSentryEnabled(dsn, "production", "production")).toBe(true);
  });

  test("stays off in development so local activity never reaches the production project", () => {
    expect(isSentryEnabled(dsn, "development", "production")).toBe(false);
    expect(isSentryEnabled(dsn, "test", "production")).toBe(false);
  });

  test.each([undefined, "development", "preview"])(
    "does not mistake a local or preview production build for a production deployment: %p",
    (deploymentEnv) => {
      expect(isSentryEnabled(dsn, "production", deploymentEnv)).toBe(false);
    },
  );

  test("stays off without a DSN", () => {
    expect(isSentryEnabled(undefined, "production", "production")).toBe(false);
    expect(isSentryEnabled("", "production", "production")).toBe(false);
  });
});

describe("sentry data collection", () => {
  // Sentry 11 collects each of these unless it is turned off, and here they would carry customer
  // emails, addresses, and order payloads.
  test("keeps customer data out of events", () => {
    expect(sentryDataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      databaseQueryData: false,
    });
  });
});

describe("sentry environment", () => {
  test("keeps the Sentry 10 names that alert rules and saved searches filter on", () => {
    expect(sentryEnvironment("production")).toBe("vercel-production");
    expect(sentryEnvironment(undefined)).toBeUndefined();
  });
});
