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

  const primaryImage = product.images[0];

  return {
    title: product.name,
    description: product.description,
    alternates: { canonical: `/products/${product.slug}` },
    openGraph: {
      title: product.name,
      description: product.description ?? undefined,
      // Product photos are square R2 uploads; platforms crop or letterbox them into
      // 1.91:1. Pages without a photo fall back to the site-wide app/opengraph-image.png.
      images: primaryImage
        ? [{ url: primaryImage.url, alt: primaryImage.alt ?? product.name }]
        : undefined,
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  // min-height accounts for the fixed-header spacer so content centers in the visible viewport.
  // Sub-lg sizes use a tighter type/spacing scale so the gallery, title, price, and
  // add-to-cart all fit above the fold in the single-column layout.
  return (
    <main className="mx-auto grid min-h-[calc(100svh-var(--header-height))] max-w-7xl items-center gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:py-10">
      <ProductGallery images={product.images} name={product.name} />
      <section className="space-y-5 lg:space-y-8">
        <div className="space-y-3 lg:space-y-4">
          <Badge variant="outline">{getProductCategoryLabel(product.category)}</Badge>
          <div className="space-y-2 lg:space-y-3">
            <h1 className="font-grotesk font-semibold text-3xl tracking-tight lg:text-5xl">
              {product.name}
            </h1>
            {product.description ? (
              <p className="text-base text-muted-foreground lg:text-lg">{product.description}</p>
            ) : null}
          </div>
        </div>
        <VariantPicker product={product} />
      </section>
    </main>
  );
}
