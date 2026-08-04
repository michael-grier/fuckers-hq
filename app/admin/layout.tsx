import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
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
    <div className="flex min-h-screen bg-muted/40">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <AdminHeader />
        <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
