import { revalidatePath, revalidateTag } from "next/cache";

// Admin edits must show on the next storefront request, so tags expire immediately rather than
// using a cacheLife profile, which would serve stale content while revalidating.
const expireNow = { expire: 0 };

export const CACHE_TAGS = {
  products: "products",
  product: (slug: string) => `product:${slug}`,
  home: "home",
} as const;

export function revalidateProducts(): void {
  revalidateTag(CACHE_TAGS.products, expireNow);
  revalidateTag(CACHE_TAGS.home, expireNow);
  revalidatePath("/products");
  revalidatePath("/");
}

export function revalidateProduct(slug: string): void {
  revalidateProductSlugs([slug]);
}

export function revalidateProductSlugs(slugs: string[]): void {
  for (const slug of new Set(slugs)) {
    revalidateTag(CACHE_TAGS.product(slug), expireNow);
    revalidatePath(`/products/${slug}`);
  }

  revalidateProducts();
}
