"use client";

import Link from "next/link";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartSummary } from "@/components/cart/cart-summary";
import { CheckoutButton } from "@/components/cart/checkout-button";
import { EmptyState } from "@/components/shop/empty-state";
import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart/store";

export function CartPageClient() {
  const lines = useCartStore((state) => state.lines);
  const clear = useCartStore((state) => state.clear);

  if (lines.length === 0) {
    return (
      <EmptyState
        title="Your cart is empty"
        description="Add hardgoods, softgoods, or accessories before heading to checkout."
        href="/products"
        action="Continue shopping"
      />
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
      <section>
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Cart</h1>
          <Button onClick={clear} type="button" variant="outline">
            Clear cart
          </Button>
        </div>
        <div>
          {lines.map((line) => (
            <CartLineItem key={line.variantId} line={line} />
          ))}
        </div>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/products">Continue shopping</Link>
        </Button>
      </section>
      <div className="space-y-4">
        <CartSummary />
        <CheckoutButton />
      </div>
    </div>
  );
}
