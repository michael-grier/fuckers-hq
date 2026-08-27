import type { Metadata } from "next";
import type { ReactNode } from "react";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { getAdminOrderNeedsActionCount } from "@/lib/admin/queries";
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
  const orderNeedsActionCount = await getAdminOrderNeedsActionCount();

  return (
    <div className="flex min-h-screen bg-muted/40">
      <AdminSidebar orderNeedsActionCount={orderNeedsActionCount} />
      {/* Offsets the fixed mobile header, matching the storefront layout. From
          lg up the header is hidden and the sidebar takes over, so no offset. */}
      <div className="min-w-0 flex-1 pt-[var(--header-height)] lg:pt-0">
        <AdminHeader orderNeedsActionCount={orderNeedsActionCount} />
        <main className="mx-auto w-full max-w-7xl px-6 py-10">{children}</main>
      </div>
    </div>
  );
}
