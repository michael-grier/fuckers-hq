import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

import { ProductStatusBadge } from "@/components/admin/status-badge";
import { formatAdminDate } from "@/lib/admin/format";
import { summarizeProductStock } from "@/lib/admin/product-list";
import type { AdminProduct } from "@/lib/admin/queries";
import { getProductCategoryLabel, isProductCategory } from "@/lib/catalog/categories";
import { formatMoney } from "@/lib/money";

export function AdminProductCard({ product }: { product: AdminProduct }) {
  const primaryImage = product.images[0];
  const stock = summarizeProductStock(product.variants);
  const prices = product.variants.map((variant) => variant.priceCents);
  const categoryLabel = isProductCategory(product.category ?? "")
    ? getProductCategoryLabel(product.category)
    : (product.category ?? "Uncategorized");

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-lg border bg-background transition hover:border-accent hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {primaryImage ? (
          <Image
            alt={primaryImage.alt ?? product.name}
            className="h-full w-full object-contain object-center"
            fill
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
            src={primaryImage.url}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center font-grotesk font-semibold text-2xl text-muted-foreground/40">
            {product.name}
          </div>
        )}
        <span className="absolute top-2.5 left-2.5">
          <ProductStatusBadge status={product.status} />
        </span>
        {stock.isOutOfStock ? (
          <span className="absolute bottom-2.5 left-2.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 font-semibold text-destructive text-xs">
            {stock.stockWarningCount > 1
              ? `${stock.stockWarningCount} variants out of stock`
              : "Out of stock"}
          </span>
        ) : stock.stockWarningCount > 1 ? (
          <span className="absolute bottom-2.5 left-2.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 text-xs">
            {stock.stockWarningCount} variants need stock
          </span>
        ) : stock.lowStockVariant ? (
          <span className="absolute bottom-2.5 left-2.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 font-semibold text-amber-800 text-xs">
            {stock.lowStockVariant.name}: {stock.lowStockVariant.available} left
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="font-semibold text-sm leading-snug">
          {/* Stretched link keeps the whole card clickable without nesting interactive elements. */}
          <Link
            className="outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
            href={`/admin/products/${product.id}` as Route}
            prefetch={false}
          >
            {product.name}
          </Link>
        </h2>
        <div className="flex items-center justify-between gap-3 text-muted-foreground text-xs">
          <span className="truncate">
            {categoryLabel} · {product.variants.length}{" "}
            {product.variants.length === 1 ? "variant" : "variants"}
          </span>
          <span className="whitespace-nowrap font-semibold text-foreground">
            {formatPriceRange(prices)}
          </span>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 text-muted-foreground text-xs">
          <time dateTime={product.updatedAt.toISOString()}>
            {formatAdminDate(product.updatedAt)}
          </time>
          <span aria-hidden="true" className="font-semibold text-foreground">
            Edit →
          </span>
        </div>
      </div>
    </article>
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
