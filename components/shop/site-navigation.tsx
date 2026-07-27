import { ChevronDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { productCategories } from "@/lib/catalog/categories";
import { cn } from "@/lib/utils";

export const shopNavigationLinks: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/products", label: "Shop All" },
  ...productCategories.map(({ label, value }) => ({
    href: `/products?category=${value}` as Route,
    label,
  })),
];

export function DesktopNavigation() {
  return (
    <nav
      aria-label="Primary navigation"
      className="hidden items-center gap-7 font-semibold text-sm lg:flex"
    >
      <div className="group relative">
        <Link
          className="flex h-10 items-center gap-1 rounded-md text-white/80 outline-none transition hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
          href="/products"
        >
          Shop
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-focus-within:rotate-180 group-hover:rotate-180"
          />
        </Link>
        <div className="invisible absolute top-full left-1/2 z-40 w-56 -translate-x-1/2 pt-2 opacity-0 transition group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
          <ul
            aria-label="Shop categories"
            className="space-y-1 rounded-lg border border-white/10 bg-neutral-950 p-2 shadow-xl"
          >
            {shopNavigationLinks.map((link) => (
              <li key={link.href}>
                <Link
                  className="block rounded-md px-3 py-2 text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
                  href={link.href}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link
        className="rounded-md text-white/80 outline-none transition hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
        href={"/crew" as Route}
      >
        Crew
      </Link>
      <Link
        className="rounded-md text-white/80 outline-none transition hover:text-white focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
        href={"/videos" as Route}
      >
        Videos
      </Link>
    </nav>
  );
}

type MobileNavigationProps = {
  isOpen: boolean;
  isShopOpen: boolean;
  onClose: () => void;
  onShopToggle: () => void;
};

export function MobileNavigation({
  isOpen,
  isShopOpen,
  onClose,
  onShopToggle,
}: MobileNavigationProps) {
  const topLevelLinkClassName =
    "block rounded-md px-4 py-3 font-semibold text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <nav
      aria-label="Mobile navigation"
      className="border-white/10 border-t lg:hidden"
      hidden={!isOpen}
      id="mobile-navigation"
    >
      <div className="mx-auto max-w-7xl space-y-1 px-6 py-4">
        <Button
          aria-controls="mobile-shop-links"
          aria-expanded={isShopOpen}
          className="w-full justify-between px-4 text-white/80 hover:bg-white/10 hover:text-white"
          onClick={onShopToggle}
          type="button"
          variant="ghost"
        >
          Shop
          <ChevronDown
            aria-hidden="true"
            className={cn("transition-transform", isShopOpen && "rotate-180")}
          />
        </Button>
        <ul
          className="ml-4 space-y-1 border-white/10 border-l pl-3"
          hidden={!isShopOpen}
          id="mobile-shop-links"
        >
          {shopNavigationLinks.map((link) => (
            <li key={link.href}>
              <Link
                className="block rounded-md px-4 py-2 text-white/70 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
                href={link.href}
                onClick={onClose}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <Link className={topLevelLinkClassName} href={"/crew" as Route} onClick={onClose}>
          Crew
        </Link>
        <Link className={topLevelLinkClassName} href={"/videos" as Route} onClick={onClose}>
          Videos
        </Link>
      </div>
    </nav>
  );
}
