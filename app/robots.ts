import type { MetadataRoute } from "next";

import { env } from "@/lib/env";
import { buildRobots } from "@/lib/seo/robots";

export default function robots(): MetadataRoute.Robots {
  return buildRobots({
    allowIndexing: env.ALLOW_INDEXING,
    baseUrl: env.NEXT_PUBLIC_APP_URL,
  });
}
