import type { Metadata } from "next";

import { CartPageClient } from "@/components/cart/cart-page-client";
import { resolveDeliveryArea } from "@/lib/checkout/delivery";
import { env } from "@/lib/env";

// Per-visitor and empty to a crawler, so it is excluded regardless of ALLOW_INDEXING.
export const metadata: Metadata = {
  title: "Cart",
  robots: { index: false, follow: false },
};

export default function CartPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <CartPageClient deliveryArea={resolveDeliveryArea(env)} />
    </main>
  );
}
