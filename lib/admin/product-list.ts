import type { AdminProductStatusFilter } from "@/lib/admin/search-params";
import { LOW_STOCK_THRESHOLD } from "@/lib/catalog/stock";

type StockVariant = {
  name: string;
  inventoryQty: number;
  reservedQty: number;
};

export type ProductStockSummary = {
  totalAvailable: number;
  isOutOfStock: boolean;
  stockWarningCount: number;
  /** The scarcest variant, only set when it is at or below the low-stock threshold. */
  lowStockVariant: { name: string; available: number } | null;
};

/** Summarizes sellable availability for inventory warnings on the admin product list. */
export function summarizeProductStock(variants: readonly StockVariant[]): ProductStockSummary {
  if (variants.length === 0) {
    return { totalAvailable: 0, isOutOfStock: true, stockWarningCount: 0, lowStockVariant: null };
  }

  const availability = variants.map((variant) => ({
    name: variant.name,
    available: variant.inventoryQty - variant.reservedQty,
  }));
  const totalAvailable = availability.reduce((total, variant) => total + variant.available, 0);
  const stockWarningCount = availability.filter(
    (variant) => variant.available <= LOW_STOCK_THRESHOLD,
  ).length;
  const scarcest = availability.reduce((lowest, variant) =>
    variant.available < lowest.available ? variant : lowest,
  );

  return {
    totalAvailable,
    isOutOfStock: totalAvailable <= 0,
    stockWarningCount,
    lowStockVariant:
      totalAvailable > 0 && scarcest.available <= LOW_STOCK_THRESHOLD ? scarcest : null,
  };
}

type FilterableProduct = {
  name: string;
  slug: string;
  status: string;
  variants: ReadonlyArray<{ name: string }>;
};

export function filterAdminProducts<T extends FilterableProduct>(
  products: readonly T[],
  filters: { q: string; status: AdminProductStatusFilter },
): T[] {
  const query = filters.q.trim().toLowerCase();

  return products.filter((product) => {
    if (filters.status !== "all" && product.status !== filters.status) {
      return false;
    }

    if (!query) {
      return true;
    }

    return (
      product.name.toLowerCase().includes(query) ||
      product.slug.toLowerCase().includes(query) ||
      product.variants.some((variant) => variant.name.toLowerCase().includes(query))
    );
  });
}

export function countProductsByStatus(
  products: ReadonlyArray<{ status: string }>,
): Record<string, number> {
  const counts: Record<string, number> = { all: products.length };

  for (const product of products) {
    counts[product.status] = (counts[product.status] ?? 0) + 1;
  }

  return counts;
}
