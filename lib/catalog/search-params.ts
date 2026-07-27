import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server";

import { type ProductCategory, productCategoryValues } from "@/lib/catalog/categories";

export const catalogSortValues = ["newest", "price-asc", "price-desc", "name-asc"] as const;
export type CatalogSort = (typeof catalogSortValues)[number];

const catalogSortParserValues = [...catalogSortValues];
const catalogCategoryParserValues = [...productCategoryValues];

const catalogSearchParamParsers = {
  q: parseAsString.withDefault(""),
  category: parseAsStringEnum<ProductCategory>(catalogCategoryParserValues),
  sort: parseAsStringEnum<CatalogSort>(catalogSortParserValues).withDefault("newest"),
  page: parseAsInteger.withDefault(1),
};

export const catalogSearchParamsCache = createSearchParamsCache(catalogSearchParamParsers);

export type CatalogSearchParams =
  ReturnType<typeof catalogSearchParamsCache.parse> extends Promise<infer T> ? T : never;
