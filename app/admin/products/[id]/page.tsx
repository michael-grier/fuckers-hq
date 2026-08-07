import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductMediaPanel } from "@/components/admin/product-media-panel";
import { ProductWorkspace } from "@/components/admin/product-workspace";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { getAdminProductById } from "@/lib/admin/queries";
import { centsToDollars } from "@/lib/money";
import { isR2Configured } from "@/lib/r2";

type AdminProductPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminProductPage({ params }: AdminProductPageProps) {
  const { id } = await params;
  const product = await getAdminProductById(id);

  if (!product) {
    notFound();
  }

  const variantCount = product.variants.length;
  const imageCount = product.images.length;
  const outOfStockCount = product.variants.filter(
    (variant) => variant.inventoryQty - variant.reservedQty <= 0,
  ).length;
  const summaryParts = [
    `${variantCount} ${variantCount === 1 ? "variant" : "variants"}`,
    `${imageCount} ${imageCount === 1 ? "image" : "images"}`,
  ];

  if (outOfStockCount > 0) {
    summaryParts.push(
      `${outOfStockCount} ${outOfStockCount === 1 ? "variant" : "variants"} out of stock`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <Button asChild className="-ml-3" size="sm" variant="ghost">
            <Link href={"/admin/products" as Route} prefetch={false}>
              ← Back to products
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-grotesk font-semibold text-4xl tracking-tight">{product.name}</h1>
            <ProductStatusBadge status={product.status} />
          </div>
          <p className="text-muted-foreground">{summaryParts.join(" · ")}</p>
        </div>
        {product.status === "active" ? (
          <Button asChild variant="outline">
            <Link href={`/products/${product.slug}` as Route}>View storefront</Link>
          </Button>
        ) : null}
      </div>

      <ProductWorkspace
        defaultValues={{
          name: product.name,
          slug: product.slug,
          description: product.description ?? "",
          category: product.category ?? "",
          status: product.status,
          variants: product.variants.map((variant) => ({
            variantId: variant.id,
            name: variant.name,
            sku: variant.sku,
            price: centsToDollars(variant.priceCents),
            inventory: String(variant.inventoryQty),
          })),
        }}
        media={
          <ProductMediaPanel
            images={product.images}
            productId={product.id}
            productName={product.name}
            r2Configured={isR2Configured()}
          />
        }
        productId={product.id}
        reservedQuantities={Object.fromEntries(
          product.variants.map((variant) => [variant.id, variant.reservedQty]),
        )}
        savedStatus={product.status}
      />
    </div>
  );
}
