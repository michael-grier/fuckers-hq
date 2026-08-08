import {
  getProductCategoryForSubcategory,
  type ProductCategory,
  type ProductSubcategory,
} from "@/lib/catalog/categories";

// Checkbox state staged locally in the filter popover until Apply commits it to the URL.
export type StagedCatalogFilters = {
  categories: ProductCategory[];
  subcategories: ProductSubcategory[];
};

// `null` removes a parameter from the URL entirely instead of writing an empty value.
export type CatalogFilterUpdate = {
  categories: ProductCategory[] | null;
  subcategories: ProductSubcategory[] | null;
};

export function toggleStagedCategory(
  staged: StagedCatalogFilters,
  category: ProductCategory,
  checked: boolean,
): StagedCatalogFilters {
  if (checked) {
    return {
      categories: staged.categories.includes(category)
        ? staged.categories
        : [...staged.categories, category],
      subcategories: staged.subcategories,
    };
  }

  return {
    categories: staged.categories.filter((value) => value !== category),
    // Deselecting a parent clears its staged child selections.
    subcategories: staged.subcategories.filter(
      (value) => getProductCategoryForSubcategory(value) !== category,
    ),
  };
}

export function toggleStagedSubcategory(
  staged: StagedCatalogFilters,
  subcategory: ProductSubcategory,
  checked: boolean,
): StagedCatalogFilters {
  return {
    categories: staged.categories,
    subcategories: checked
      ? staged.subcategories.includes(subcategory)
        ? staged.subcategories
        : [...staged.subcategories, subcategory]
      : staged.subcategories.filter((value) => value !== subcategory),
  };
}

/**
 * Converts staged checkbox state into the single atomic URL update Apply performs. A scoped
 * view keeps its singular category, never writes multi-category parameters (removing stray
 * ones), and accepts only subcategories belonging to the scope; Shop All drops orphaned
 * subcategories whose parent is not selected.
 */
export function toCatalogFilterUpdate(
  staged: StagedCatalogFilters,
  scopedCategory: ProductCategory | null,
): CatalogFilterUpdate {
  const subcategories = staged.subcategories.filter((value) =>
    scopedCategory
      ? getProductCategoryForSubcategory(value) === scopedCategory
      : staged.categories.includes(getProductCategoryForSubcategory(value)),
  );

  return {
    categories: !scopedCategory && staged.categories.length > 0 ? staged.categories : null,
    subcategories: subcategories.length > 0 ? subcategories : null,
  };
}
