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
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link className="font-black text-xl tracking-normal" href={"/admin" as Route}>
              Fuckers HQ Admin
            </Link>
            <nav aria-label="Admin navigation" className="flex items-center gap-1">
              <Button asChild size="sm" variant="ghost">
                <Link href={"/admin" as Route} prefetch={false}>
                  Overview
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={"/admin/products" as Route} prefetch={false}>
                  Products
                </Link>
              </Button>
              <Button asChild size="sm" variant="ghost">
                <Link href={"/admin/orders" as Route} prefetch={false}>
                  Orders
                </Link>
              </Button>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Button asChild size="sm" variant="outline">
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
