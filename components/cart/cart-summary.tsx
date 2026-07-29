"use client";

import { getCartSubtotalCents } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import { formatMoney } from "@/lib/money";

export function CartSummary() {
  const lines = useCartStore((state) => state.lines);
  const subtotal = getCartSubtotalCents(lines);

  return (
    <aside className="h-fit rounded-lg border p-5">
      <h2 className="font-grotesk font-semibold text-2xl">Summary</h2>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-bold">{formatMoney(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Shipping</dt>
          <dd className="font-bold">Calculated at checkout</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="font-bold">Calculated by Stripe</dd>
        </div>
      </dl>
    </aside>
  );
}
