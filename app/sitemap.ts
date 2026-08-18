import type { MetadataRoute } from "next";

import { getActiveProductSlugs } from "@/lib/catalog/queries";
import { env } from "@/lib/env";
import { buildSitemap } from "@/lib/seo/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemap({
    baseUrl: env.NEXT_PUBLIC_APP_URL,
    products: await getActiveProductSlugs(),
    now: new Date(),
  });
}
