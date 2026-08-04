import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/product-form";
import { ProductImageManager } from "@/components/admin/product-image-manager";
import { ProductStatusBadge } from "@/components/admin/status-badge";
import { VariantForm } from "@/components/admin/variant-form";
import { Button } from "@/components/ui/button";
import { getAdminProductById } from "@/lib/admin/queries";
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

  return (
    <div className="space-y-10">
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
        </div>
        {product.status === "active" ? (
          <Button asChild variant="outline">
            <Link href={`/products/${product.slug}` as Route}>View storefront</Link>
          </Button>
        ) : null}
      </div>

      <section aria-labelledby="details-heading" className="space-y-4">
        <div>
          <h2 className="font-bold text-2xl" id="details-heading">
            Product details
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Public catalog pages update after each saved change.
          </p>
        </div>
        <div className="rounded-lg border bg-background p-6">
          <ProductForm
            defaultValues={{
              name: product.name,
              slug: product.slug,
              description: product.description ?? "",
              category: product.category ?? "",
              status: product.status,
            }}
            productId={product.id}
          />
        </div>
      </section>

      <section aria-labelledby="images-heading" className="space-y-4">
        <div>
          <h2 className="font-bold text-2xl" id="images-heading">
            Product images
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Lower positions appear first on the storefront.
          </p>
        </div>
        <ProductImageManager
          images={product.images}
          productId={product.id}
          productName={product.name}
          r2Configured={isR2Configured()}
        />
      </section>

      <section aria-labelledby="variants-heading" className="space-y-4">
        <div>
          <h2 className="font-bold text-2xl" id="variants-heading">
            Variants
          </h2>
          <p className="mt-1 text-muted-foreground text-sm">
            Inventory shows on-hand, reserved, and currently available quantities. Variants appear
            in this order on the storefront.
          </p>
        </div>

        <div className="space-y-4">
          {product.variants.map((variant, index) => (
            <VariantForm
              canMoveDown={index < product.variants.length - 1}
              canMoveUp={index > 0}
              key={variant.id}
              productId={product.id}
              productStatus={product.status}
              variant={variant}
            />
          ))}
          <div>
            <h3 className="mb-3 font-bold text-lg">Add variant</h3>
            <VariantForm productId={product.id} productStatus={product.status} />
          </div>
        </div>
      </section>
    </div>
  );
}
