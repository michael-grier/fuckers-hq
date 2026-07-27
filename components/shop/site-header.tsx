"use client";

import { Menu, Search, ShoppingCart } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { DesktopNavigation } from "@/components/shop/site-navigation";
import { Button } from "@/components/ui/button";
import { getCartItemCount } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";

export function SiteHeader() {
  const itemCount = useCartStore((state) => getCartItemCount(state.lines));

  return (
    <header className="sticky top-0 z-30 border-b bg-neutral-950 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Button className="text-white hover:bg-white/10 md:hidden" size="icon" variant="ghost">
            <Menu aria-hidden="true" />
            <span className="sr-only">Open navigation</span>
          </Button>
          <Link className="font-black text-2xl tracking-normal" href="/">
            Skate Shop
          </Link>
        </div>
        <DesktopNavigation />
        <div className="flex items-center gap-2">
          <Button asChild className="text-white hover:bg-white/10" size="icon" variant="ghost">
            <Link href="/products">
              <Search aria-hidden="true" />
              <span className="sr-only">Search products</span>
            </Link>
          </Button>
          <Button
            asChild
            className="relative text-white hover:bg-white/10"
            size="icon"
            variant="ghost"
          >
            <Link href={"/cart" as Route}>
              <ShoppingCart aria-hidden="true" />
              <span className="sr-only">Cart</span>
              <span className="absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-black text-[11px] text-accent-foreground">
                {itemCount}
              </span>
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
