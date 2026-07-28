import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import { Space_Grotesk } from "next/font/google";
import Image from "next/image";
import Link from "next/link";

import { getProductCategoryLabel, type productCategories } from "@/lib/catalog/categories";
import { getFeaturedProducts } from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

// Landing page uses a self-contained "dusk" palette (charcoal ink surfaces,
// fire-gold accent from the flame logo) instead of the global theme tokens.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"] });

const fallbackProducts = [
  { name: "Street Deck 8.25", category: "Hardgoods", price: "$89.00" },
  { name: "Canvas Coach Jacket", category: "Softgoods", price: "$128.00" },
  { name: "Precision Bearings", category: "Hardgoods", price: "$34.00" },
];

type HomeDisplayProduct = {
  name: string;
  category: string;
  price: string;
  slug?: string;
  imageUrl?: string;
  imageAlt?: string;
};

// Each category tile reuses the hero photo with a distinct crop until
// dedicated category photography exists — swap objectPosition/scale then.
const categoryTiles: ReadonlyArray<{
  value: (typeof productCategories)[number]["value"];
  label: string;
  caption: string;
  imageClassName: string;
}> = [
  {
    value: "hardgoods",
    label: "Hardgoods",
    caption: "Decks, trucks, and wheels",
    imageClassName: "scale-[2.2] object-[38%_12%]",
  },
  {
    value: "softgoods",
    label: "Softgoods",
    caption: "Tees, hoods, and jackets",
    imageClassName: "scale-[1.9] object-[96%_32%]",
  },
  {
    value: "accessories",
    label: "Accessories",
    caption: "Bearings to wax",
    imageClassName: "scale-[1.7] object-[12%_78%]",
  },
];

const shopPromises = [
  {
    highlight: "Free",
    rest: " grip + setup",
    detail: "Every deck ships assembled and gripped by the shop, no charge, forever.",
  },
  {
    highlight: "Same-day",
    rest: " shipping",
    detail: "Order by 3pm and it's on the truck. Free over $75.",
  },
  {
    highlight: "Crew",
    rest: "-tested stock",
    detail: "If the team wouldn't ride it, it doesn't make the wall. Simple as that.",
  },
];

export default async function HomePage() {
  const featuredProducts = await getFeaturedProducts(3);
  const displayProducts: HomeDisplayProduct[] =
    featuredProducts.length > 0
      ? featuredProducts.map((product) => ({
          name: product.name,
          slug: product.slug,
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
    <main className="min-h-screen bg-[#101317] text-[#eceff2]">
      <section aria-label="Featured" className="relative flex min-h-[560px] items-end md:h-[92svh]">
        <Image
          alt="Skater grinding the lip of a graffiti-covered bowl while the crowd watches"
          className="object-cover object-[center_25%]"
          fill
          priority
          sizes="100vw"
          src="/fuckers-hero.jpg"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#101317] via-[#10131740] to-transparent"
        />
        <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-40 pb-12">
          <p
            className={cn(
              spaceGrotesk.className,
              "flex items-center gap-2 font-semibold text-[#ffc42e] text-xs uppercase tracking-[0.14em] [text-shadow:0_1px_10px_rgba(16,19,23,0.9)]",
            )}
          >
            <span aria-hidden="true" className="h-0.5 w-6 bg-[#ffc42e]" />
            Fresh off the truck
          </p>
          <h1
            className={cn(
              spaceGrotesk.className,
              "mt-3 max-w-[20ch] font-semibold text-4xl leading-[1.05] tracking-tight md:text-6xl",
            )}
          >
            Gear that keeps up with the session.
          </h1>
          <p className="mt-3 max-w-md text-[#eceff2]/85 text-lg">
            Shop-tested decks, wheels, and daily-wear. Picked by the crew, shipped same day.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-[#ffc42e] px-6 py-3 font-semibold text-[#101317] text-sm transition hover:brightness-105 md:hover:scale-[1.03]"
              href="/products"
            >
              Shop the drop
            </Link>
            <Link
              className="rounded-full border border-white/40 px-6 py-3 font-semibold text-sm transition hover:border-white"
              href={"/videos" as Route}
            >
              Watch the edit
            </Link>
          </div>
        </div>
      </section>

      <section aria-labelledby="trending-heading" className="pt-16">
        <div className="mx-auto flex max-w-7xl flex-wrap items-baseline justify-between gap-4 px-6 pb-8">
          <h2
            className={cn(
              spaceGrotesk.className,
              "font-semibold text-3xl tracking-tight md:text-4xl",
            )}
            id="trending-heading"
          >
            New and trending
          </h2>
          <Link
            className="font-semibold text-[#ffc42e] text-sm hover:underline hover:underline-offset-4"
            href="/products"
          >
            Shop all
            <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-3">
          {categoryTiles.map((tile) => (
            <Link
              className="group relative aspect-[4/5] overflow-hidden"
              href={`/products?category=${tile.value}` as Route}
              key={tile.value}
            >
              <Image
                alt=""
                className={cn(
                  "object-cover saturate-[0.9] transition duration-300 group-hover:saturate-[1.05]",
                  tile.imageClassName,
                )}
                fill
                sizes="(min-width: 640px) 33vw, 100vw"
                src="/fuckers-hero.jpg"
              />
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-[#101317]/60 via-transparent to-transparent"
              />
              <span className="absolute bottom-4 left-5 z-10">
                <span className={cn(spaceGrotesk.className, "font-semibold text-lg")}>
                  {tile.label}
                </span>
                <span className="block text-[#eceff2]/70 text-sm">{tile.caption}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-label="Why shop with us" className="mt-16 border-[#262c33] border-y">
        <div className="mx-auto grid max-w-7xl grid-cols-1 divide-[#262c33] divide-y px-6 md:grid-cols-3 md:divide-x md:divide-y-0">
          {shopPromises.map((promise) => (
            <div className="py-8 md:pr-6 md:pl-6 md:first:pl-0" key={promise.highlight}>
              <h3 className={cn(spaceGrotesk.className, "font-semibold text-lg")}>
                <span className="text-[#ffc42e]">{promise.highlight}</span>
                {promise.rest}
              </h3>
              <p className="mt-1.5 text-[#8b939c] text-sm leading-relaxed">{promise.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="picks-heading" className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-4 pb-8">
          <h2
            className={cn(
              spaceGrotesk.className,
              "font-semibold text-3xl tracking-tight md:text-4xl",
            )}
            id="picks-heading"
          >
            This week's picks
          </h2>
          <Link
            className="font-semibold text-[#ffc42e] text-sm hover:underline hover:underline-offset-4"
            href="/products"
          >
            See everything
            <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {displayProducts.map((product) => (
            <Link
              className="group"
              href={product.slug ? (`/products/${product.slug}` as Route) : "/products"}
              key={product.name}
            >
              <div className="relative aspect-square overflow-hidden rounded-lg border border-[#262c33] bg-[#171b20] transition group-hover:border-[#ffc42e]">
                {product.imageUrl ? (
                  <Image
                    alt={product.imageAlt ?? product.name}
                    className="h-full w-full object-contain object-center"
                    fill
                    sizes="(min-width: 768px) 30vw, 90vw"
                    src={product.imageUrl}
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="flex justify-between gap-4 pt-3">
                <div>
                  <h3 className="font-semibold">{product.name}</h3>
                  <p className="mt-0.5 text-[#8b939c] text-sm">{product.category}</p>
                </div>
                <p className={cn(spaceGrotesk.className, "font-semibold")}>{product.price}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
