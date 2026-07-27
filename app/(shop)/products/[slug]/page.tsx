import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductGallery } from "@/components/shop/product-gallery";
import { VariantPicker } from "@/components/shop/variant-picker";
import { Badge } from "@/components/ui/badge";
import { getProductCategoryLabel } from "@/lib/catalog/categories";
import { getProductBySlug } from "@/lib/catalog/queries";

export const revalidate = 300;

type ProductPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return {
      title: "Product not found",
    };
  }

  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-7xl gap-10 px-6 py-10 lg:grid-cols-[1.1fr_0.9fr]">
      <ProductGallery images={product.images} name={product.name} />
      <section className="space-y-8">
        <div className="space-y-4">
          <Badge variant="outline">{getProductCategoryLabel(product.category)}</Badge>
          <div className="space-y-3">
            <h1 className="font-black text-5xl tracking-normal">{product.name}</h1>
            {product.description ? (
              <p className="text-lg text-muted-foreground">{product.description}</p>
            ) : null}
          </div>
        </div>
        <VariantPicker product={product} />
      </section>
    </main>
  );
}
