import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/observability/sentry-enabled";
import { sentryDataCollection, sentryEnvironment } from "@/lib/observability/sentry-options";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: isSentryEnabled(dsn, process.env.NODE_ENV, process.env.NEXT_PUBLIC_VERCEL_ENV),
  environment: sentryEnvironment(process.env.NEXT_PUBLIC_VERCEL_ENV),
  dataCollection: sentryDataCollection,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
