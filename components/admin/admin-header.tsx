"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { adminNavLinks, isAdminNavLinkActive } from "@/components/admin/admin-nav";
import { AdminUserButton } from "@/components/admin/admin-user-button";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Compact top bar for viewports below lg, where the admin sidebar is hidden.
 * Fixed like the storefront header so the collapsible panel overlays content
 * instead of pushing it down; the admin layout offsets it with --header-height.
 */
export function AdminHeader() {
  const pathname = usePathname();
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
    <header className="fixed inset-x-0 top-0 z-40 border-white/10 border-b bg-surface-chrome text-white lg:hidden">
      <div className="flex items-center justify-between gap-4 px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            aria-controls="admin-mobile-navigation"
            aria-expanded={isMobileNavigationOpen}
            className="text-white hover:bg-white/10"
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
            className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
            href="/admin"
            onClick={closeMobileNavigation}
          >
            <BrandLogo className="h-8 shrink-0" />
            <span className="truncate font-sans font-semibold text-white/50 text-xs uppercase tracking-widest">
              Admin
            </span>
          </Link>
        </div>
        <AdminUserButton />
      </div>
      <nav
        aria-label="Admin mobile navigation"
        className="border-white/10 border-t"
        hidden={!isMobileNavigationOpen}
        id="admin-mobile-navigation"
      >
        <div className="space-y-1 px-6 py-4">
          {adminNavLinks.map((link) => {
            const isActive = isAdminNavLinkActive(pathname, link);

            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-md px-4 py-3 font-semibold outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent",
                  isActive
                    ? "bg-white/10 text-white shadow-[inset_2px_0_0_var(--accent)]"
                    : "text-white/80",
                )}
                href={link.href}
                key={link.href}
                onClick={closeMobileNavigation}
                prefetch={false}
              >
                {link.label}
              </Link>
            );
          })}
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
