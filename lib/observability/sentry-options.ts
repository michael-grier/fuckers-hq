import type * as Sentry from "@sentry/nextjs";

// Header and query-parameter names that can carry a client IP or user identity, matched as
// substrings. The SDK's built-in filter for keys, tokens, and other secrets still applies.
const identifyingKeys = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };

/**
 * Event data the client, server, and edge SDKs may collect. Left unset, Sentry 11 attaches user
 * details, cookies, request and response bodies, and database query values, which here would
 * include customer emails, addresses, and order payloads. This keeps the restrictive baseline
 * Sentry 10 applied under `sendDefaultPii: false`.
 */
export const sentryDataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: identifyingKeys, response: identifyingKeys },
  httpBodies: [],
  urlQueryParams: identifyingKeys,
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies Parameters<typeof Sentry.init>[0]["dataCollection"];

/**
 * Sentry environment for events and build deploys on a Vercel deployment. Sentry 11 defaults to
 * the bare Vercel name (`production`); Sentry 10 used `vercel-production`, which existing alert
 * rules and saved searches filter on. Off Vercel this returns undefined, leaving the SDK default.
 */
export function sentryEnvironment(vercelEnv: string | undefined): string | undefined {
  return vercelEnv ? `vercel-${vercelEnv}` : undefined;
}
