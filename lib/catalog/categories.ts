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

export function isProductCategory(value: string): value is ProductCategory {
  return productCategoryValues.some((category) => category === value);
}

export function getProductCategoryLabel(category: string | null): string {
  if (!category || !isProductCategory(category)) {
    return "Uncategorized";
  }

  return productCategoryLabels.get(category) ?? "Uncategorized";
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
