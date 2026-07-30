import type { Metadata, Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { AdminUserButton } from "@/components/admin/admin-user-button";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/require-admin";

export const metadata: Metadata = {
  title: "Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Sticky (not fixed) so the wrapping nav can grow taller on narrow screens without overlapping content. */}
      {/* Matches the storefront header: a flush solid bar below lg, a floating translucent bar from lg up. */}
      <header className="sticky top-0 z-40 border-white/10 border-b bg-neutral-950 text-white lg:top-3 lg:mx-3 lg:rounded-xl lg:border lg:bg-neutral-950/90 lg:backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-2.5">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              className="font-bold font-grotesk text-lg tracking-tight"
              href={"/admin" as Route}
            >
              Fuckers <span className="text-accent">Skateboards</span> Admin
            </Link>
            <nav aria-label="Admin navigation" className="flex items-center gap-1">
              <Button
                asChild
                className="text-white/80 hover:bg-white/10 hover:text-white"
                size="sm"
                variant="ghost"
              >
                <Link href={"/admin" as Route} prefetch={false}>
                  Overview
                </Link>
              </Button>
              <Button
                asChild
                className="text-white/80 hover:bg-white/10 hover:text-white"
                size="sm"
                variant="ghost"
              >
                <Link href={"/admin/products" as Route} prefetch={false}>
                  Products
                </Link>
              </Button>
              <Button
                asChild
                className="text-white/80 hover:bg-white/10 hover:text-white"
                size="sm"
                variant="ghost"
              >
                <Link href={"/admin/orders" as Route} prefetch={false}>
                  Orders
                </Link>
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Button
              asChild
              className="border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
              size="sm"
              variant="outline"
            >
              <Link href="/">View storefront</Link>
            </Button>
            <AdminUserButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-6 py-10">{children}</main>
    </div>
  );
}
