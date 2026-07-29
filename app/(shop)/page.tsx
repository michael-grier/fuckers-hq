import { ArrowRight } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";

import { type ProductCategory, productCategories } from "@/lib/catalog/categories";

// Landing page uses a self-contained "dusk" palette (charcoal ink surfaces,
// fire-gold accent from the flame logo) instead of the global theme tokens.

// Labels come from the catalog source of truth; only presentation extras live here.
const categoryTileExtras: Record<ProductCategory, { caption: string; imageSrc: string }> = {
  hardgoods: { caption: "Decks, trucks, and wheels", imageSrc: "/hardgoods.jpg" },
  softgoods: { caption: "Tees, hoods, and jackets", imageSrc: "/softgoods.jpg" },
  accessories: { caption: "Bearings to wax", imageSrc: "/accessories.jpg" },
};

const categoryTiles = productCategories.map(({ label, value }) => ({
  label,
  value,
  ...categoryTileExtras[value],
}));

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#101317] text-[#eceff2]">
      <section
        aria-label="Featured"
        className="relative flex h-[calc(100svh-var(--header-height))] min-h-[620px] items-end lg:-mt-[var(--header-height)] lg:h-svh"
      >
        <Image
          alt="Skater grinding the lip of a graffiti-covered bowl while the crowd watches"
          className="object-cover object-[28%_25%] md:object-[center_25%]"
          fill
          priority
          sizes="100vw"
          src="/fuckers-hero.jpg"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-[#101317] via-[#10131740] to-transparent"
        />
        {/* Hero copy anchors to the viewport edge (like the nav), not the content max-width. */}
        <div className="relative z-10 w-full px-6 pt-40 pb-12 lg:px-8">
          <h1 className="mt-3 max-w-[20ch] font-grotesk font-semibold text-4xl leading-[1.05] tracking-tight md:text-6xl">
            Buy our stuff, we're broke.
          </h1>
          <p className="mt-3 max-w-md text-[#eceff2]/85 text-lg">
            We work hard to support the Calgary skate community, support us by buying some gear!
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              className="rounded-full bg-[#ffc42e] px-6 py-3 font-semibold text-[#101317] text-sm transition hover:brightness-105 md:hover:scale-[1.03]"
              href="/products"
            >
              Shop our stuff
            </Link>
            <Link
              className="rounded-full border border-white/40 px-6 py-3 font-semibold text-sm transition hover:border-white"
              href={"/videos" as Route}
            >
              Watch our videos
            </Link>
          </div>
        </div>
      </section>

      {/* Light band: a deliberate visual break from the dark hero above and dark footer below. */}
      <section aria-labelledby="trending-heading" className="bg-white py-16 text-[#101317]">
        <div className="flex flex-wrap items-baseline justify-between gap-4 px-6 pb-10 lg:px-8">
          <h2
            className="font-grotesk font-semibold text-3xl tracking-tight md:text-4xl"
            id="trending-heading"
          >
            Categories
          </h2>
          <Link
            className="font-semibold text-sm underline decoration-[#ffc42e] decoration-2 underline-offset-4 hover:decoration-4"
            href="/products"
          >
            Shop all
            <ArrowRight aria-hidden="true" className="ml-1 inline size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-3">
          {categoryTiles.map((tile) => (
            <Link
              className="group"
              href={`/products?category=${tile.value}` as Route}
              key={tile.value}
            >
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  alt=""
                  className="object-cover transition duration-300 md:group-hover:scale-[1.02]"
                  fill
                  sizes="(min-width: 640px) 33vw, 100vw"
                  src={tile.imageSrc}
                />
              </div>
              <div className="py-5 text-center">
                <span className="font-grotesk font-semibold text-lg group-hover:underline group-hover:decoration-[#ffc42e] group-hover:decoration-2 group-hover:underline-offset-4">
                  {tile.label}
                </span>
                <span className="block text-[#68727d] text-sm">{tile.caption}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
