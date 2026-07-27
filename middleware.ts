import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { getCanonicalCatalogCategoryUrl } from "@/lib/catalog/categories";

function isAdminRoute(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

export default clerkMiddleware(
  async (auth, request) => {
    if (request.nextUrl.pathname === "/products") {
      const canonicalUrl = getCanonicalCatalogCategoryUrl(request.nextUrl);

      if (canonicalUrl) {
        return NextResponse.redirect(canonicalUrl);
      }
    }

    if (isAdminRoute(request.nextUrl.pathname)) {
      await auth.protect();
    }
  },
  {
    contentSecurityPolicy: {
      directives: {
        "base-uri": ["self"],
        "connect-src": [
          "https://*.ingest.sentry.io",
          "https://*.ingest.us.sentry.io",
          "https://*.r2.cloudflarestorage.com",
          ...(process.env.NODE_ENV === "production" ? [] : ["ws:"]),
        ],
        "frame-ancestors": ["none"],
        "img-src": ["blob:", "https:"],
        "object-src": ["none"],
      },
    },
  },
);

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
