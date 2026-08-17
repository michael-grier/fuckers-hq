import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for readable browser stack traces in Sentry. The SDK only enables this itself on
  // Turbopack builds, so a webpack build emits no client source maps and uploads only the handful
  // Next.js produces regardless — leaving Sentry unable to symbolicate most client errors.
  //
  // Gated on the same variable as `sourcemaps.disable` below, because Next.js serves generated
  // `.map` files publicly and only Sentry's post-upload deletion removes them. Enabling this
  // unconditionally would publish readable source from every build that cannot upload — preview
  // deployments and local builds, which have no token.
  productionBrowserSourceMaps: Boolean(process.env.SENTRY_AUTH_TOKEN),
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
  },
  telemetry: false,
  webpack: {
    treeshake: {
      removeDebugLogging: true,
      removeTracing: true,
    },
  },
});
