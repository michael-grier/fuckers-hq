import { describe, expect, test } from "bun:test";
import { isSentryEnabled } from "@/lib/observability/sentry-enabled";
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

  test("reports only from production builds with a DSN", () => {
    expect(isSentryEnabled(dsn, "production")).toBe(true);
  });

  test("stays off in development so local activity never reaches the production project", () => {
    expect(isSentryEnabled(dsn, "development")).toBe(false);
    expect(isSentryEnabled(dsn, "test")).toBe(false);
  });

  test("stays off without a DSN", () => {
    expect(isSentryEnabled(undefined, "production")).toBe(false);
    expect(isSentryEnabled("", "production")).toBe(false);
  });
});
