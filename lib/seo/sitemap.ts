import type { MetadataRoute } from "next";

/** A product the sitemap should list, reduced to what a sitemap entry needs. */
export type SitemapProduct = {
  slug: string;
  updatedAt: Date;
};

// Pages worth crawling. Cart and order confirmation are deliberately absent: they are per-visitor
// and carry no indexable content, and both are marked noindex at the page level.
const staticPaths = [
  "/",
  "/products",
  "/crew",
  "/videos",
  "/contact",
  "/shipping",
  "/returns",
  "/privacy",
  "/terms",
] as const;

/**
 * Builds the sitemap from the active catalogue. `now` is injected so the static entries have a
 * stable timestamp under test.
 */
export function buildSitemap(options: {
  baseUrl: string;
  products: SitemapProduct[];
  now: Date;
}): MetadataRoute.Sitemap {
  const absolute = (path: string) => new URL(path, options.baseUrl).toString();

  return [
    ...staticPaths.map((path) => ({
      url: absolute(path),
      lastModified: options.now,
    })),
    ...options.products.map((product) => ({
      url: absolute(`/products/${product.slug}`),
      lastModified: product.updatedAt,
    })),
  ];
}
