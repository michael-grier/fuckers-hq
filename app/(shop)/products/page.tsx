import type { SearchParams } from "nuqs/server";

import { CatalogFilters } from "@/components/shop/catalog-filters";
import { CatalogPagination } from "@/components/shop/catalog-pagination";
import { PageHeader } from "@/components/shop/page-header";
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
    <main className="min-h-screen py-10">
      <PageHeader
        title={getCatalogHeading(parsedSearchParams.category)}
      />
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 pt-8">
        <CatalogFilters totalProducts={catalog.totalProducts} />
        <ProductGrid products={catalog.products} />
        <CatalogPagination
          currentPage={catalog.page}
          searchParams={parsedSearchParams}
          totalPages={catalog.totalPages}
        />
      </div>
    </main>
  );
}
