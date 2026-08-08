"use client";

import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { adminNavGroups, isAdminNavLinkActive } from "@/components/admin/admin-nav";
import { AdminUserButton } from "@/components/admin/admin-user-button";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-surface-chrome text-white lg:flex">
      <Link
        className="flex flex-col items-center px-6 pt-6 pb-4 outline-none focus-visible:text-accent"
        href="/admin"
      >
        <BrandLogo />
        <span className="mt-1 font-sans font-semibold text-white/50 text-xs uppercase tracking-widest">
          Admin
        </span>
      </Link>

      <nav aria-label="Admin navigation" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
        {adminNavGroups.map((group) => (
          <div key={group.label ?? "root"}>
            {group.label ? (
              <p className="px-3 pb-1 font-semibold text-white/40 text-xs uppercase tracking-widest">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-1">
              {group.links.map((link) => {
                const isActive = isAdminNavLinkActive(pathname, link);

                return (
                  <li className="relative" key={link.href}>
                    {isActive ? (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-accent"
                      />
                    ) : null}
                    <Link
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 font-medium text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-accent",
                        isActive
                          ? "bg-white/10 font-semibold text-white"
                          : "text-white/70 hover:bg-white/5 hover:text-white",
                      )}
                      href={link.href}
                      prefetch={false}
                    >
                      <link.icon aria-hidden="true" className="size-4 shrink-0" />
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="space-y-3 border-white/10 border-t px-3 py-4">
        <Link
          className="flex items-center gap-3 rounded-md px-3 py-2 font-medium text-sm text-white/70 outline-none transition hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-accent"
          href="/"
        >
          <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
          View storefront
        </Link>
        <div className="px-3">
          <AdminUserButton />
        </div>
      </div>
    </aside>
  );
}
