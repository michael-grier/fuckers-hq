import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server";

import {
  getProductCategoryForSubcategory,
  type ProductCategory,
  type ProductSubcategory,
  productCategoryValues,
  productSubcategoryValues,
} from "@/lib/catalog/categories";

export const catalogSortValues = ["newest", "price-asc", "price-desc", "name-asc"] as const;
export type CatalogSort = (typeof catalogSortValues)[number];

const catalogSortParserValues = [...catalogSortValues];
const catalogCategoryParserValues = [...productCategoryValues];
const catalogSubcategoryParserValues = [...productSubcategoryValues];

// `category` is the nav-defined view scope; `categories`/`subcategories` are the shopper's
// multi-select filters, carried as repeated native-array parameters. Unknown values are
// silently discarded by the enum item parsers.
//
// Exported so the client filter UI parses the URL with exactly these parsers. A second
// hand-maintained copy would let the staged checkboxes and the active count drift from the
// server-side filtering the next time the taxonomy parameters change.
export const catalogSearchParamParsers = {
  q: parseAsString.withDefault(""),
  category: parseAsStringEnum<ProductCategory>(catalogCategoryParserValues),
  categories: parseAsNativeArrayOf(parseAsStringEnum<ProductCategory>(catalogCategoryParserValues)),
  subcategories: parseAsNativeArrayOf(
    parseAsStringEnum<ProductSubcategory>(catalogSubcategoryParserValues),
  ),
  sort: parseAsStringEnum<CatalogSort>(catalogSortParserValues).withDefault("newest"),
  page: parseAsInteger.withDefault(1),
};

export const catalogSearchParamsCache = createSearchParamsCache(catalogSearchParamParsers);

export type CatalogSearchParams =
  ReturnType<typeof catalogSearchParamsCache.parse> extends Promise<infer T> ? T : never;

export type CatalogTaxonomyFilter = {
  scopedCategory: ProductCategory | null;
  categories: ProductCategory[];
  subcategories: ProductSubcategory[];
};

function dedupe<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

/**
 * Reduces raw URL state to the effective taxonomy filter.
 *
 * On a category-scoped view the singular `category` stays locked: multi-category parameters are
 * ignored and only subcategories belonging to the scope are kept. On Shop All, selected
 * categories are kept as-is and orphaned subcategories (whose parent category is not selected)
 * are discarded.
 */
export function resolveCatalogTaxonomy(
  params: Pick<CatalogSearchParams, "category" | "categories" | "subcategories">,
): CatalogTaxonomyFilter {
  if (params.category) {
    const scopedCategory = params.category;

    return {
      scopedCategory,
      categories: [],
      subcategories: dedupe(
        params.subcategories.filter(
          (subcategory) => getProductCategoryForSubcategory(subcategory) === scopedCategory,
        ),
      ),
    };
  }

  const categories = dedupe(params.categories);

  return {
    scopedCategory: null,
    categories,
    subcategories: dedupe(
      params.subcategories.filter((subcategory) =>
        categories.includes(getProductCategoryForSubcategory(subcategory)),
      ),
    ),
  };
}

/**
 * Applies the union semantics: within a parent category, selected subcategories are ORed; a
 * selected parent with no selected subcategories includes all of its products; results from
 * selected parents are unioned. No selection at all matches everything in the current scope.
 */
export function matchesCatalogTaxonomy(
  product: { category: string | null; subcategory: string | null },
  filter: CatalogTaxonomyFilter,
): boolean {
  if (filter.scopedCategory) {
    if (product.category !== filter.scopedCategory) {
      return false;
    }

    return (
      filter.subcategories.length === 0 ||
      filter.subcategories.some((subcategory) => subcategory === product.subcategory)
    );
  }

  if (filter.categories.length === 0) {
    return true;
  }

  return filter.categories.some((category) => {
    if (product.category !== category) {
      return false;
    }

    const selectedChildren = filter.subcategories.filter(
      (subcategory) => getProductCategoryForSubcategory(subcategory) === category,
    );

    return (
      selectedChildren.length === 0 ||
      selectedChildren.some((subcategory) => subcategory === product.subcategory)
    );
  });
}

// Catalog results are rendered by a Server Component, so client URL updates must trigger a
// server navigation instead of nuqs' default shallow update.
export const catalogFilterUrlOptions = { shallow: false } as const;

// `null` removes a filter parameter from the URL entirely (used by Clear and by scoped views
// discarding stray multi-category parameters).
type CatalogFilterUpdate = Partial<{
  q: CatalogSearchParams["q"];
  sort: CatalogSearchParams["sort"];
  categories: CatalogSearchParams["categories"] | null;
  subcategories: CatalogSearchParams["subcategories"] | null;
}>;

export function withFirstCatalogPage<T extends CatalogFilterUpdate>(update: T): T & { page: 1 } {
  return { ...update, page: 1 };
}
