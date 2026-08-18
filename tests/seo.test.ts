import { describe, expect, test } from "bun:test";

import { buildRobots } from "@/lib/seo/robots";
import { buildSitemap } from "@/lib/seo/sitemap";

const baseUrl = "https://fuckersskateboards.com";

describe("buildRobots", () => {
  // The store went live at its real domain before it could take a payment. Indexing it in that
  // state is the failure this flag exists to prevent, and it is far cheaper to prevent than undo.
  test("refuses every crawler while indexing is off", () => {
    const robots = buildRobots({ allowIndexing: false, baseUrl });

    expect(robots.rules).toEqual([{ userAgent: "*", disallow: "/" }]);
    expect(robots.sitemap).toBeUndefined();
  });

  test("allows crawling and advertises the sitemap once indexing is on", () => {
    const robots = buildRobots({ allowIndexing: true, baseUrl });

    expect(robots.rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }]);
    expect(robots.sitemap).toBe("https://fuckersskateboards.com/sitemap.xml");
  });
});

describe("buildSitemap", () => {
  const now = new Date("2026-08-18T00:00:00.000Z");

  test("lists public pages and every active product as absolute URLs", () => {
    const updatedAt = new Date("2026-08-01T12:00:00.000Z");
    const sitemap = buildSitemap({
      baseUrl,
      now,
      products: [{ slug: "flame-logo-tee-black", updatedAt }],
    });

    const urls = sitemap.map((entry) => entry.url);

    expect(urls).toContain("https://fuckersskateboards.com/");
    expect(urls).toContain("https://fuckersskateboards.com/products");
    expect(urls).toContain("https://fuckersskateboards.com/products/flame-logo-tee-black");
    expect(sitemap.every((entry) => entry.url.startsWith(baseUrl))).toBe(true);

    const product = sitemap.find((entry) => entry.url.endsWith("/flame-logo-tee-black"));
    expect(product?.lastModified).toBe(updatedAt);
  });

  // Both are per-visitor and marked noindex at the page level; listing them would invite crawls
  // that can only produce empty or session-specific pages.
  test("omits cart and order confirmation", () => {
    const urls = buildSitemap({ baseUrl, now, products: [] }).map((entry) => entry.url);

    expect(urls).not.toContain("https://fuckersskateboards.com/cart");
    expect(urls.some((url) => url.includes("/order/"))).toBe(false);
  });
});
