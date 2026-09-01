import { describe, expect, test } from "bun:test";

import { assertProductionDatabaseTarget } from "@/scripts/verify-production-database";

describe("assertProductionDatabaseTarget", () => {
  const endpointId = "ep-bitter-art-a6pyx5cs";

  test("accepts pooled and direct URLs for the expected Neon endpoint", () => {
    expect(
      assertProductionDatabaseTarget({
        databaseUrl: `postgresql://user:pass@${endpointId}-pooler.us-west-2.aws.neon.tech/store`,
        expectedEndpointId: endpointId,
      }),
    ).toBe(endpointId);
    expect(
      assertProductionDatabaseTarget({
        databaseUrl: `postgresql://user:pass@${endpointId}.us-west-2.aws.neon.tech/store`,
        expectedEndpointId: endpointId,
      }),
    ).toBe(endpointId);
  });

  test("rejects a different Neon endpoint without printing credentials", () => {
    try {
      assertProductionDatabaseTarget({
        databaseUrl:
          "postgresql://user:private-password@ep-bold-hill-a6z24k97.us-west-2.aws.neon.tech/store",
        expectedEndpointId: endpointId,
      });
      throw new Error("Expected the database target check to fail.");
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      expect(error.message).toBe(
        `DATABASE_URL targets Neon endpoint ep-bold-hill-a6z24k97, expected ${endpointId}.`,
      );
      expect(error.message).not.toContain("private-password");
    }
  });

  test("rejects missing configuration and non-Neon hosts", () => {
    expect(() =>
      assertProductionDatabaseTarget({
        databaseUrl: undefined,
        expectedEndpointId: endpointId,
      }),
    ).toThrow("DATABASE_URL is required");
    expect(() =>
      assertProductionDatabaseTarget({
        databaseUrl: `postgresql://user:pass@${endpointId}.us-west-2.aws.neon.tech/store`,
        expectedEndpointId: undefined,
      }),
    ).toThrow("PRODUCTION_NEON_ENDPOINT_ID is required");
    expect(() =>
      assertProductionDatabaseTarget({
        databaseUrl: "postgresql://user:pass@database.example.com/store",
        expectedEndpointId: endpointId,
      }),
    ).toThrow("recognized Neon endpoint");
  });
});
