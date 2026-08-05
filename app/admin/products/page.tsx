import type { Route } from "next";
import Link from "next/link";
import type { SearchParams } from "nuqs/server";

import { AdminFilterPills } from "@/components/admin/admin-filter-pills";
import { AdminProductCard } from "@/components/admin/admin-product-card";
import { AdminSearchField } from "@/components/admin/admin-search-field";
import { Button } from "@/components/ui/button";
import { countProductsByStatus, filterAdminProducts } from "@/lib/admin/product-list";
import { getAdminProducts } from "@/lib/admin/queries";
import { adminProductSearchParamsCache } from "@/lib/admin/search-params";

type AdminProductsPageProps = {
  searchParams: Promise<SearchParams>;
};

export default async function AdminProductsPage({ searchParams }: AdminProductsPageProps) {
  const filters = await adminProductSearchParamsCache.parse(searchParams);
  const products = await getAdminProducts();
  const counts = countProductsByStatus(products);
  const visibleProducts = filterAdminProducts(products, filters);
  const lowStockCount = products.filter((product) =>
    product.variants.some(
      (variant) => variant.inventoryQty - variant.reservedQty <= 0 && product.status === "active",
    ),
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            {products.length} {products.length === 1 ? "product" : "products"}
            {lowStockCount > 0 ? ` · ${lowStockCount} with an out-of-stock variant` : null}
          </p>
        </div>
        <Button
          asChild
          className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Link href={"/admin/products/new" as Route} prefetch={false}>
            New product
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminFilterPills
          defaultValue="all"
          label="Filter products by status"
          name="status"
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active ?? 0 },
            { value: "draft", label: "Draft", count: counts.draft ?? 0 },
            { value: "archived", label: "Archived", count: counts.archived ?? 0 },
          ]}
        />
        <AdminSearchField
          id="admin-product-search"
          label="Search products"
          placeholder="Search name, slug, variant…"
        />
      </div>

      {products.length === 0 ? (
        <EmptyProducts />
      ) : visibleProducts.length === 0 ? (
        <NoMatches />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visibleProducts.map((product) => (
            <AdminProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}

function NoMatches() {
  return (
    <section className="rounded-lg border border-dashed bg-background px-6 py-12 text-center">
      <h2 className="font-bold text-xl">No products match these filters</h2>
      <p className="mt-2 text-muted-foreground">Try a different status or search term.</p>
      <Button asChild className="mt-5" variant="outline">
        <Link href={"/admin/products" as Route} prefetch={false}>
          Clear filters
        </Link>
      </Button>
    </section>
  );
}

function EmptyProducts() {
  return (
    <section className="rounded-lg border border-dashed bg-background px-6 py-12 text-center">
      <h2 className="font-bold text-xl">No products yet</h2>
      <p className="mt-2 text-muted-foreground">Create your first product to get started.</p>
      <Button asChild className="mt-5">
        <Link href={"/admin/products/new" as Route} prefetch={false}>
          New product
        </Link>
      </Button>
    </section>
  );
}
