import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/observability/sentry-enabled";
import { sentryDataCollection, sentryEnvironment } from "@/lib/observability/sentry-options";

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: isSentryEnabled(dsn, process.env.NODE_ENV, process.env.VERCEL_ENV),
  environment: sentryEnvironment(process.env.VERCEL_ENV),
  dataCollection: sentryDataCollection,
  tracesSampleRate: 0,
});
