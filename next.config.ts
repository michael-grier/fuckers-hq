import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for readable browser stack traces in Sentry. Set explicitly because the SDK only
  // enables it on Turbopack builds, so a `--webpack` build would otherwise emit no client source
  // maps and leave Sentry unable to symbolicate most client errors.
  //
  // Gated on the same variable as `sourcemaps.disable` below, because Next.js serves generated
  // `.map` files publicly and only Sentry's post-upload deletion removes them. Enabling this
  // unconditionally would publish readable source from every build that cannot upload, such as
  // preview deployments and local builds without a token.
  productionBrowserSourceMaps: Boolean(process.env.SENTRY_AUTH_TOKEN),
  compiler: {
    // Strips Sentry's debug logging and tracing code from every bundle. The SDK's own
    // `webpack.treeshake` option sets these flags on webpack builds only, and tracing is off in
    // every runtime config (`tracesSampleRate: 0`).
    define: {
      __SENTRY_DEBUG__: "false",
      __SENTRY_TRACING__: "false",
    },
  },
  // `next dev` otherwise rewrites AGENTS.md with a managed block whenever it detects a coding
  // agent. AGENTS.md is maintained by hand and already points at the version-matched docs.
  agentRules: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Permitted-Cross-Domain-Policies",
            value: "none",
          },
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000",
                },
              ]
            : []),
        ],
      },
    ];
  },
  typedRoutes: true,
};

export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    // The SDK turns this on for Turbopack builds only when it enables source maps itself. Setting
    // `productionBrowserSourceMaps` above skips that path, so without this, uploaded maps would
    // stay publicly served.
    deleteSourcemapsAfterUpload: true,
  },
  telemetry: false,
});
