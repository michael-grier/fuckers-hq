/**
 * Blocks production migrations and Vercel builds when DATABASE_URL targets the wrong Neon
 * endpoint. Vercel cannot read sensitive values back, so the trusted job compares only the
 * connection hostname's non-secret endpoint ID.
 */

import { env } from "@/lib/env";
import { endpointHostFromUrl } from "@/scripts/worktree-db";

/** Verifies a Neon connection string against its expected non-secret endpoint ID. */
export function assertProductionDatabaseTarget(input: {
  databaseUrl: string | undefined;
  expectedEndpointId: string | undefined;
}): string {
  if (!input.databaseUrl) {
    throw new Error("DATABASE_URL is required to verify the production database target.");
  }
  if (!input.expectedEndpointId) {
    throw new Error(
      "PRODUCTION_NEON_ENDPOINT_ID is required to verify the production database target.",
    );
  }

  const endpointHost = endpointHostFromUrl(input.databaseUrl);
  const endpointId = endpointHost?.split(".")[0];
  if (!endpointHost?.endsWith(".neon.tech") || !endpointId?.match(/^ep-[a-z0-9-]+$/)) {
    throw new Error("DATABASE_URL does not target a recognized Neon endpoint.");
  }
  if (endpointId !== input.expectedEndpointId) {
    throw new Error(
      `DATABASE_URL targets Neon endpoint ${endpointId}, expected ${input.expectedEndpointId}.`,
    );
  }

  return endpointId;
}

/** Runs the guard only where the expected production target must be configured. */
function main(): void {
  const required = process.argv.includes("--required") || process.env.VERCEL_ENV === "production";
  if (!required && !env.PRODUCTION_NEON_ENDPOINT_ID) {
    return;
  }

  const endpointId = assertProductionDatabaseTarget({
    databaseUrl: env.DATABASE_URL,
    expectedEndpointId: env.PRODUCTION_NEON_ENDPOINT_ID,
  });
  console.log(`Verified DATABASE_URL targets Neon endpoint ${endpointId}.`);
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
