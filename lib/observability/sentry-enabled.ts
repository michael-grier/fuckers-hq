/**
 * Shared gate for the client, server, and edge `Sentry.init()` calls.
 *
 * Reporting is limited to production builds. A DSN present in a developer's `.env.local` would
 * otherwise send local sessions and errors to the same project that receives production traffic,
 * mixing local noise into production issues and consuming quota. To exercise the wiring locally,
 * temporarily relax this gate rather than shipping a development-enabled default.
 *
 * `nodeEnv` is passed in rather than read here so the decision stays a pure function of its
 * arguments, and so each caller keeps the build-time `process.env.NODE_ENV` inlining its own
 * bundle performs.
 */
export function isSentryEnabled(dsn: string | undefined, nodeEnv: string | undefined): boolean {
  return Boolean(dsn) && nodeEnv === "production";
}
