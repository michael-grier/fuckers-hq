import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProductCategoryLabel } from "@/lib/catalog/categories";
import { getFeaturedProducts } from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/money";

const fallbackProducts = [
  { name: "Street Deck 8.25", category: "Hardgoods", price: "$89.00" },
  { name: "Canvas Coach Jacket", category: "Softgoods", price: "$128.00" },
  { name: "Precision Bearings", category: "Hardgoods", price: "$34.00" },
];

type HomeDisplayProduct = {
  name: string;
  category: string;
  price: string;
  imageUrl?: string;
  imageAlt?: string;
};

export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts(3);
  const displayProducts: HomeDisplayProduct[] =
    featuredProducts.length > 0
      ? featuredProducts.map((product) => ({
          name: product.name,
          category: getProductCategoryLabel(product.category),
          price:
            product.minPriceCents == null
              ? "Price unavailable"
              : formatMoney(product.minPriceCents),
          imageUrl: product.images[0]?.url,
          imageAlt: product.images[0]?.alt ?? product.name,
        }))
      : fallbackProducts;

  return (
    <main className="min-h-screen bg-background">
      <section className="border-b bg-neutral-950 text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 md:grid-cols-[0.9fr_1.1fr] md:items-end md:py-16">
          <div className="space-y-6">
            <Badge className="bg-accent text-accent-foreground" variant="secondary">
              Free shipping threshold ready
            </Badge>
            <div className="space-y-4">
              <h1 className="max-w-2xl font-black text-5xl tracking-normal md:text-7xl">
                Built for daily skate goods.
              </h1>
              <p className="max-w-xl text-lg text-white/70">
                A lean catalog, guest checkout, and admin-managed inventory backed by Postgres and
                Stripe.
              </p>
            </div>
            <Button asChild className="bg-white text-neutral-950 hover:bg-white/90" size="lg">
              <Link href="/products">
                Shop products
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {displayProducts.map((product) => (
              <div className="min-w-0 space-y-3" key={product.name}>
                <div className="relative aspect-square overflow-hidden rounded-lg border border-white/10 bg-neutral-100">
                  {product.imageUrl ? (
                    <Image
                      alt={product.imageAlt ?? product.name}
                      className="h-full w-full object-contain object-center"
                      fill
                      sizes="(min-width: 768px) 22vw, 30vw"
                      src={product.imageUrl}
                      unoptimized
                    />
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className="truncate font-black text-lg">{product.name}</p>
                  <p className="text-white/60 text-sm">{product.category}</p>
                  <p className="font-bold">{product.price}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-6 py-10 md:grid-cols-3">
        {[
          "Server-authoritative pricing",
          "Webhook-born paid orders",
          "Direct R2 image uploads",
        ].map((label) => (
          <div className="border-t pt-4" key={label}>
            <h2 className="font-black text-2xl">{label}</h2>
            <p className="mt-2 text-muted-foreground">
              The implementation follows the architecture plan and keeps critical boundaries on the
              server.
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
