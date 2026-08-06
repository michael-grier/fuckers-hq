import type { ReactNode } from "react";

import { CartSidebar } from "@/components/cart/cart-sidebar";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { resolvePickupLocation } from "@/lib/checkout/pickup";
import { env } from "@/lib/env";

export default function ShopLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <CartSidebar pickupLocation={resolvePickupLocation(env)}>
      <SiteHeader />
      {/* Offsets the fixed header; from lg up, full-bleed heroes pull under the floating bar with lg:-mt-[var(--header-height)]. */}
      <div className="pt-[var(--header-height)]">{children}</div>
      <SiteFooter />
    </CartSidebar>
  );
}
