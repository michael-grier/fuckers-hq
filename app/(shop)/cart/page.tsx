import { CartPageClient } from "@/components/cart/cart-page-client";
import { resolveDeliveryArea } from "@/lib/checkout/delivery";
import { env } from "@/lib/env";

export default function CartPage() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-6 py-10">
      <CartPageClient deliveryArea={resolveDeliveryArea(env)} />
    </main>
  );
}
