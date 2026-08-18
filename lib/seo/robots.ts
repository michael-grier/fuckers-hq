import type { MetadataRoute } from "next";

/**
 * Builds the `robots.txt` rules. Indexing is opt-in: until the store can take a real payment,
 * every crawler is refused so the domain is not indexed mid-setup. `allowIndexing` is passed in
 * rather than read here so the decision stays a pure function of its arguments.
 *
 * `/admin` and `/api` stay disallowed even once indexing is on. Neither is linked, but a crawler
 * that finds them wastes budget on routes that return 404s or 401s.
 */
export function buildRobots(options: {
  allowIndexing: boolean;
  baseUrl: string;
}): MetadataRoute.Robots {
  if (!options.allowIndexing) {
    return {
      rules: [{ userAgent: "*", disallow: "/" }],
    };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: new URL("/sitemap.xml", options.baseUrl).toString(),
  };
}
