export const productCategoryValues = ["hardgoods", "softgoods", "accessories"] as const;

export type ProductCategory = (typeof productCategoryValues)[number];

export const productCategories = [
  { label: "Hardgoods", value: "hardgoods" },
  { label: "Softgoods", value: "softgoods" },
  { label: "Accessories", value: "accessories" },
] as const satisfies ReadonlyArray<{ label: string; value: ProductCategory }>;

const productCategoryLabels = new Map<ProductCategory, string>(
  productCategories.map(({ label, value }) => [value, label]),
);

const legacyProductCategoryAliases: Readonly<Record<string, ProductCategory>> = {
  decks: "hardgoods",
  apparel: "softgoods",
};

export const productSubcategoryValues = [
  "decks",
  "trucks",
  "wheels",
  "bearings",
  "griptape",
  "hardware",
  "t-shirts",
  "hoodies",
  "jackets",
  "pants",
  "hats",
  "socks",
  "stickers",
  "patches",
  "keychains",
  "buttons",
  "papers",
  "magnets",
] as const;

export type ProductSubcategory = (typeof productSubcategoryValues)[number];

// The fixed taxonomy: every subcategory belongs to exactly one parent category. The database
// check constraint on products mirrors these pairs, so schema and contract must change together.
export const productSubcategories = [
  { label: "Decks", value: "decks", category: "hardgoods" },
  { label: "Trucks", value: "trucks", category: "hardgoods" },
  { label: "Wheels", value: "wheels", category: "hardgoods" },
  { label: "Bearings", value: "bearings", category: "hardgoods" },
  { label: "Griptape", value: "griptape", category: "hardgoods" },
  { label: "Hardware", value: "hardware", category: "hardgoods" },
  { label: "T-Shirts", value: "t-shirts", category: "softgoods" },
  { label: "Hoodies", value: "hoodies", category: "softgoods" },
  { label: "Jackets", value: "jackets", category: "softgoods" },
  { label: "Pants", value: "pants", category: "softgoods" },
  { label: "Hats", value: "hats", category: "softgoods" },
  { label: "Socks", value: "socks", category: "softgoods" },
  { label: "Stickers", value: "stickers", category: "accessories" },
  { label: "Patches", value: "patches", category: "accessories" },
  { label: "Keychains", value: "keychains", category: "accessories" },
  { label: "Buttons", value: "buttons", category: "accessories" },
  { label: "Papers", value: "papers", category: "accessories" },
  { label: "Magnets", value: "magnets", category: "accessories" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: ProductSubcategory;
  category: ProductCategory;
}>;

const productSubcategoryLabels = new Map<ProductSubcategory, string>(
  productSubcategories.map(({ label, value }) => [value, label]),
);

const productSubcategoryParents = new Map<ProductSubcategory, ProductCategory>(
  productSubcategories.map(({ category, value }) => [value, category]),
);

export function isProductCategory(value: string): value is ProductCategory {
  return productCategoryValues.some((category) => category === value);
}

export function isProductSubcategory(value: string): value is ProductSubcategory {
  return productSubcategoryValues.some((subcategory) => subcategory === value);
}

export function getProductSubcategoryLabel(subcategory: string | null): string {
  if (!subcategory || !isProductSubcategory(subcategory)) {
    return "Uncategorized";
  }

  return productSubcategoryLabels.get(subcategory) ?? "Uncategorized";
}

export function getProductCategoryForSubcategory(subcategory: ProductSubcategory): ProductCategory {
  const category = productSubcategoryParents.get(subcategory);

  if (!category) {
    throw new Error(`Unmapped product subcategory: ${subcategory}`);
  }

  return category;
}

export function getProductSubcategoryOptions(
  category: ProductCategory,
): ReadonlyArray<{ label: string; value: ProductSubcategory }> {
  return productSubcategories
    .filter((subcategory) => subcategory.category === category)
    .map(({ label, value }) => ({ label, value }));
}

export function isValidProductTaxonomyPair(category: string, subcategory: string): boolean {
  return (
    isProductCategory(category) &&
    isProductSubcategory(subcategory) &&
    getProductCategoryForSubcategory(subcategory) === category
  );
}

/**
 * The subcategories the given products actually occupy, in canonical option order.
 *
 * The taxonomy is fixed and far larger than the catalogue, so a filter UI built from the full
 * list offers subcategories that can only ever return an empty grid.
 */
export function getPopulatedProductSubcategories(
  products: ReadonlyArray<{ category: string | null; subcategory: string | null }>,
): ProductSubcategory[] {
  const populated = new Set<ProductSubcategory>();

  for (const { category, subcategory } of products) {
    // The pair is validated rather than the subcategory alone, because the filters match on both:
    // a row whose subcategory does not belong to its category is unreachable either way.
    if (
      category &&
      subcategory &&
      isProductSubcategory(subcategory) &&
      isValidProductTaxonomyPair(category, subcategory)
    ) {
      populated.add(subcategory);
    }
  }

  return productSubcategoryValues.filter((value) => populated.has(value));
}

export function getProductCategoryLabel(category: string | null): string {
  if (!category || !isProductCategory(category)) {
    return "Uncategorized";
  }

  return productCategoryLabels.get(category) ?? "Uncategorized";
}

export function getCatalogHeading(category: ProductCategory | null): string {
  return category ? getProductCategoryLabel(category) : "Shop All";
}

export function getLegacyProductCategoryAlias(value: unknown): ProductCategory | null {
  if (typeof value !== "string") {
    return null;
  }

  return legacyProductCategoryAliases[value.trim().toLowerCase()] ?? null;
}

export function getCanonicalCatalogCategoryUrl(url: URL): URL | null {
  const category = getLegacyProductCategoryAlias(url.searchParams.get("category"));

  if (!category) {
    return null;
  }

  const canonicalUrl = new URL(url);
  canonicalUrl.searchParams.set("category", category);

  return canonicalUrl;
}
