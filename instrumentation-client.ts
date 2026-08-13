import * as Sentry from "@sentry/nextjs";

import { isSentryEnabled } from "@/lib/observability/sentry-enabled";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: isSentryEnabled(dsn, process.env.NODE_ENV),
  sendDefaultPii: false,
  tracesSampleRate: 0,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
