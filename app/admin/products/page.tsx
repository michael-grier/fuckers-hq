import type { Route } from "next";
import Link from "next/link";

import { ProductStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatAdminDate } from "@/lib/admin/format";
import { getAdminProducts } from "@/lib/admin/queries";
import { getProductCategoryLabel, isProductCategory } from "@/lib/catalog/categories";
import { formatMoney } from "@/lib/money";

export default async function AdminProductsPage() {
  const products = await getAdminProducts();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Products</h1>
          <p className="text-muted-foreground">
            Review every product, including draft and archived inventory.
          </p>
        </div>
        <Button asChild>
          <Link href={"/admin/products/new" as Route} prefetch={false}>
            New product
          </Link>
        </Button>
      </div>

      {products.length === 0 ? (
        <EmptyProducts />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-4xl text-left text-sm">
            <caption className="sr-only">All products and inventory totals</caption>
            <thead className="border-b bg-muted/50">
              <tr>
                <TableHeading>Product</TableHeading>
                <TableHeading>Status</TableHeading>
                <TableHeading>Variants</TableHeading>
                <TableHeading>Inventory</TableHeading>
                <TableHeading>Price range</TableHeading>
                <TableHeading>Updated</TableHeading>
                <TableHeading>
                  <span className="sr-only">Actions</span>
                </TableHeading>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => {
                const prices = product.variants.map((variant) => variant.priceCents);
                const onHand = product.variants.reduce(
                  (total, variant) => total + variant.inventoryQty,
                  0,
                );
                const reserved = product.variants.reduce(
                  (total, variant) => total + variant.reservedQty,
                  0,
                );
                const categoryLabel = isProductCategory(product.category ?? "")
                  ? getProductCategoryLabel(product.category)
                  : (product.category ?? "Uncategorized");

                return (
                  <tr key={product.id}>
                    <td className="px-4 py-4 align-top">
                      <p className="font-semibold">{product.name}</p>
                      <p className="mt-1 text-muted-foreground text-xs">
                        {categoryLabel} · /{product.slug}
                      </p>
                    </td>
                    <td className="px-4 py-4 align-top">
                      <ProductStatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-4 align-top">{product.variants.length}</td>
                    <td className="px-4 py-4 align-top">
                      <span className="font-medium">{onHand - reserved} available</span>
                      <span className="block text-muted-foreground text-xs">
                        {onHand} on hand · {reserved} reserved
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top">{formatPriceRange(prices)}</td>
                    <td className="whitespace-nowrap px-4 py-4 align-top">
                      <time dateTime={product.updatedAt.toISOString()}>
                        {formatAdminDate(product.updatedAt)}
                      </time>
                    </td>
                    <td className="px-4 py-4 text-right align-top">
                      <div className="flex justify-end gap-2">
                        {product.status === "active" ? (
                          <Button asChild size="sm" variant="outline">
                            <Link href={`/products/${product.slug}` as Route}>View</Link>
                          </Button>
                        ) : null}
                        <Button asChild size="sm">
                          <Link href={`/admin/products/${product.id}` as Route} prefetch={false}>
                            Edit
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
      {children}
    </th>
  );
}

function formatPriceRange(prices: number[]): string {
  if (prices.length === 0) {
    return "No variants";
  }

  const minimum = Math.min(...prices);
  const maximum = Math.max(...prices);

  return minimum === maximum
    ? formatMoney(minimum)
    : `${formatMoney(minimum)} – ${formatMoney(maximum)}`;
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
