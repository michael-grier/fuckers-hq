"use client";

import { Menu, Search, ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { DesktopNavigation, MobileNavigation } from "@/components/shop/site-navigation";
import { Button } from "@/components/ui/button";
import { SheetTrigger } from "@/components/ui/sheet";
import { getCartItemCount } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";

export function SiteHeader() {
  const itemCount = useCartStore((state) => getCartItemCount(state.lines));
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const [isMobileShopOpen, setIsMobileShopOpen] = useState(false);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);

  function closeMobileNavigation() {
    setIsMobileNavigationOpen(false);
    setIsMobileShopOpen(false);
  }

  function toggleMobileNavigation() {
    if (isMobileNavigationOpen) {
      setIsMobileShopOpen(false);
    }

    setIsMobileNavigationOpen(!isMobileNavigationOpen);
  }

  useEffect(() => {
    if (!isMobileNavigationOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      setIsMobileNavigationOpen(false);
      setIsMobileShopOpen(false);
      mobileNavigationTriggerRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavigationOpen]);

  return (
    <header className="sticky top-0 z-30 border-b bg-neutral-950 text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            aria-controls="mobile-navigation"
            aria-expanded={isMobileNavigationOpen}
            className="text-white hover:bg-white/10 lg:hidden"
            onClick={toggleMobileNavigation}
            ref={mobileNavigationTriggerRef}
            size="icon"
            type="button"
            variant="ghost"
          >
            {isMobileNavigationOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            <span className="sr-only">
              {isMobileNavigationOpen ? "Close navigation" : "Open navigation"}
            </span>
          </Button>
          <Link
            className="font-black text-2xl tracking-normal"
            href="/"
            onClick={closeMobileNavigation}
          >
            Fuckers HQ
          </Link>
        </div>
        <DesktopNavigation />
        <div className="flex items-center gap-2">
          <Button asChild className="text-white hover:bg-white/10" size="icon" variant="ghost">
            <Link href="/products" onClick={closeMobileNavigation}>
              <Search aria-hidden="true" />
              <span className="sr-only">Search products</span>
            </Link>
          </Button>
          <SheetTrigger asChild>
            <Button
              className="relative text-white hover:bg-white/10"
              onClick={closeMobileNavigation}
              size="icon"
              type="button"
              variant="ghost"
            >
              <ShoppingCart aria-hidden="true" />
              <span className="sr-only">Cart</span>
              <span className="absolute -top-1 -right-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-accent px-1 font-black text-[11px] text-accent-foreground">
                {itemCount}
              </span>
            </Button>
          </SheetTrigger>
        </div>
      </div>
      <MobileNavigation
        isOpen={isMobileNavigationOpen}
        isShopOpen={isMobileShopOpen}
        onClose={closeMobileNavigation}
        onShopToggle={() => setIsMobileShopOpen(!isMobileShopOpen)}
      />
    </header>
  );
}
