import { ShoppingCart } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProductCategoryLabel } from "@/lib/catalog/categories";
import type { CatalogProduct } from "@/lib/catalog/queries";

import { Price } from "./price";

type ProductCardProps = {
  product: CatalogProduct;
};

export function ProductCard({ product }: ProductCardProps) {
  const primaryImage = product.images[0];
  const href = `/products/${product.slug}` as Route;
  const isOutOfStock = product.totalInventoryQty <= 0;

  return (
    <article className="group min-w-0">
      <Link className="block space-y-3" href={href}>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
          {primaryImage ? (
            <Image
              alt={primaryImage.alt ?? product.name}
              className="h-full w-full object-contain object-center"
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
              src={primaryImage.url}
              unoptimized
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-neutral-100 px-4 text-center font-black text-2xl text-neutral-300">
              {product.name}
            </div>
          )}
          {isOutOfStock ? (
            <Badge className="absolute top-3 right-3 bg-neutral-950 text-white">Out of stock</Badge>
          ) : null}
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="truncate font-black text-2xl tracking-normal">{product.name}</h2>
          <p className="truncate text-muted-foreground text-sm">
            {getProductCategoryLabel(product.category)}
          </p>
          <p className="font-bold">
            <Price cents={product.minPriceCents} maxCents={product.maxPriceCents} />
          </p>
        </div>
      </Link>
      <Button asChild className="mt-3 w-full" variant="outline">
        <Link href={href}>
          <ShoppingCart aria-hidden="true" />
          View product
        </Link>
      </Button>
    </article>
  );
}
