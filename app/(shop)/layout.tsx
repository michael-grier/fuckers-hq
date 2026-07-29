import type { ReactNode } from "react";

import { CartSidebar } from "@/components/cart/cart-sidebar";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader } from "@/components/shop/site-header";

export default function ShopLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <CartSidebar>
      <SiteHeader />
      {/* Offsets the fixed floating header; full-bleed heroes pull under it with -mt-[68px]. */}
      <div className="pt-[68px]">{children}</div>
      <SiteFooter />
    </CartSidebar>
  );
}
