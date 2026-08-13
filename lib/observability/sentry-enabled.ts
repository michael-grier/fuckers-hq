/**
 * Shared gate for the client, server, and edge `Sentry.init()` calls.
 *
 * Reporting is limited to production builds. A DSN present in a developer's `.env.local` would
 * otherwise send local sessions and errors to the same project that receives production traffic,
 * mixing local noise into production issues and consuming quota. To exercise the wiring locally,
 * temporarily relax this gate rather than shipping a development-enabled default.
 */
export function isSentryEnabled(
  dsn: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  return Boolean(dsn) && nodeEnv === "production";
}
