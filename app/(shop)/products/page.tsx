import type { SearchParams } from "nuqs/server";

import { CatalogFilters } from "@/components/shop/catalog-filters";
import { CatalogPagination } from "@/components/shop/catalog-pagination";
import { ProductGrid } from "@/components/shop/product-grid";
import { getCatalogHeading } from "@/lib/catalog/categories";
import { getCatalogPage } from "@/lib/catalog/queries";
import { catalogSearchParamsCache } from "@/lib/catalog/search-params";

export const revalidate = 300;

type ProductsPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const parsedSearchParams = await catalogSearchParamsCache.parse(searchParams);
  const catalog = await getCatalogPage(parsedSearchParams);

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3 border-b pb-8">
        <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          Catalog
        </p>
        <div className="space-y-2">
          <h1 className="font-black text-5xl tracking-normal">
            {getCatalogHeading(parsedSearchParams.category)}
          </h1>
          <p className="max-w-2xl text-muted-foreground">
            Hardgoods, softgoods, and accessories with inventory managed directly from Postgres.
          </p>
        </div>
      </header>
      <CatalogFilters totalProducts={catalog.totalProducts} />
      <ProductGrid products={catalog.products} />
      <CatalogPagination
        currentPage={catalog.page}
        searchParams={parsedSearchParams}
        totalPages={catalog.totalPages}
      />
    </main>
  );
}
