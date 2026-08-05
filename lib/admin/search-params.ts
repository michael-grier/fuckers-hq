import { createSearchParamsCache, parseAsString, parseAsStringEnum } from "nuqs/server";

import { productStatusValues } from "@/lib/db/schema";

export const adminProductStatusFilterValues = ["all", ...productStatusValues] as const;
export type AdminProductStatusFilter = (typeof adminProductStatusFilterValues)[number];

const adminProductStatusParserValues = [...adminProductStatusFilterValues];

export const adminProductSearchParamsCache = createSearchParamsCache({
  q: parseAsString.withDefault(""),
  status: parseAsStringEnum<AdminProductStatusFilter>(adminProductStatusParserValues).withDefault(
    "all",
  ),
});

export type AdminProductSearchParams =
  ReturnType<typeof adminProductSearchParamsCache.parse> extends Promise<infer T> ? T : never;

// Admin lists render on the server, so client URL updates must trigger a server
// navigation instead of nuqs' default shallow update.
export const adminFilterUrlOptions = { shallow: false } as const;
