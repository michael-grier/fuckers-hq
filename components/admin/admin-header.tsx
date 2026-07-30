"use client";

import { Menu, X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { AdminUserButton } from "@/components/admin/admin-user-button";
import { Button } from "@/components/ui/button";

const adminNavigationLinks: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/admin" as Route, label: "Overview" },
  { href: "/admin/products" as Route, label: "Products" },
  { href: "/admin/orders" as Route, label: "Orders" },
];

export function AdminHeader() {
  const [isMobileNavigationOpen, setIsMobileNavigationOpen] = useState(false);
  const mobileNavigationTriggerRef = useRef<HTMLButtonElement>(null);

  function closeMobileNavigation() {
    setIsMobileNavigationOpen(false);
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
      mobileNavigationTriggerRef.current?.focus();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavigationOpen]);

  return (
    // Sticky (not fixed) so the panel can push content down instead of overlapping it.
    // Matches the storefront header: a flush solid bar below lg, a floating translucent bar from lg up.
    <header className="sticky top-0 z-40 border-white/10 border-b bg-neutral-950 text-white lg:top-3 lg:mx-3 lg:rounded-xl lg:border lg:bg-neutral-950/90 lg:backdrop-blur-md">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 lg:px-5">
        <div className="flex min-w-0 items-center gap-2 lg:gap-6">
          <Button
            aria-controls="admin-mobile-navigation"
            aria-expanded={isMobileNavigationOpen}
            className="text-white hover:bg-white/10 lg:hidden"
            onClick={() => setIsMobileNavigationOpen(!isMobileNavigationOpen)}
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
            className="truncate font-bold font-grotesk text-base tracking-tight lg:text-lg"
            href={"/admin" as Route}
            onClick={closeMobileNavigation}
          >
            Fuckers <span className="text-accent">Skateboards</span> Admin
          </Link>
          <nav aria-label="Admin navigation" className="hidden items-center gap-1 lg:flex">
            {adminNavigationLinks.map((link) => (
              <Button
                asChild
                className="text-white/80 hover:bg-white/10 hover:text-white"
                key={link.href}
                size="sm"
                variant="ghost"
              >
                <Link href={link.href} prefetch={false}>
                  {link.label}
                </Link>
              </Button>
            ))}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {/* Below lg this link lives in the collapsible panel to keep the bar on one line. */}
          <Button
            asChild
            className="hidden border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white lg:inline-flex"
            size="sm"
            variant="outline"
          >
            <Link href="/">View storefront</Link>
          </Button>
          <AdminUserButton />
        </div>
      </div>
      <nav
        aria-label="Admin mobile navigation"
        className="border-white/10 border-t lg:hidden"
        hidden={!isMobileNavigationOpen}
        id="admin-mobile-navigation"
      >
        <div className="space-y-1 px-4 py-3">
          {adminNavigationLinks.map((link) => (
            <Link
              className="block rounded-md px-4 py-3 font-semibold text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
              href={link.href}
              key={link.href}
              onClick={closeMobileNavigation}
              prefetch={false}
            >
              {link.label}
            </Link>
          ))}
          <Link
            className="block rounded-md px-4 py-3 font-semibold text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
            href="/"
            onClick={closeMobileNavigation}
          >
            View storefront
          </Link>
        </div>
      </nav>
    </header>
  );
}
