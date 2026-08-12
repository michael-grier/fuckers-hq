import type { ReactNode } from "react";

import { CartSidebar } from "@/components/cart/cart-sidebar";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";
import { resolveDeliveryArea } from "@/lib/checkout/delivery";
import { env } from "@/lib/env";

export default function ShopLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <CartSidebar deliveryArea={resolveDeliveryArea(env)}>
      <SiteHeader />
      {/* Offsets the fixed header; from lg up, full-bleed heroes pull under the floating bar with lg:-mt-[var(--header-height)]. */}
      <div className="pt-[var(--header-height)]">{children}</div>
      <SiteFooter />
    </CartSidebar>
  );
}
