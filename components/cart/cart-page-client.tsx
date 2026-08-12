"use client";

import Link from "next/link";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartSummary } from "@/components/cart/cart-summary";
import { CheckoutButton } from "@/components/cart/checkout-button";
import { FulfillmentPicker } from "@/components/cart/fulfillment-picker";
import { EmptyState } from "@/components/shop/empty-state";
import { Button } from "@/components/ui/button";
import { useCartHydrated, useCartStore } from "@/lib/cart/store";
import type { CartDisplayLine } from "@/lib/cart/types";
import type { DeliveryArea } from "@/lib/checkout/delivery";

const skeletonLines = ["line-one", "line-two"];

type CartPageContentProps = {
  lines: CartDisplayLine[];
  onClear: () => void;
  // Required rather than defaulted: omitting it would silently drop delivery from checkout.
  deliveryArea: DeliveryArea | null;
};

function CartPageSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-8 lg:grid-cols-[1fr_22rem]" role="status">
      <span className="sr-only">Loading your cart.</span>
      <section aria-hidden="true">
        <div className="flex items-center justify-between gap-4 border-b pb-4">
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
          <div className="h-9 w-28 animate-pulse rounded-md bg-muted" />
        </div>
        {skeletonLines.map((line) => (
          <div className="grid gap-4 border-b py-5 sm:grid-cols-[6rem_1fr_auto]" key={line}>
            <div className="aspect-square animate-pulse rounded-md bg-muted" />
            <div className="space-y-2">
              <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-9 w-32 animate-pulse rounded-md bg-muted" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded bg-muted sm:justify-self-end" />
          </div>
        ))}
      </section>
      <div aria-hidden="true" className="space-y-4">
        <div className="h-28 animate-pulse rounded-lg bg-muted" />
        <div className="h-32 animate-pulse rounded-lg bg-muted" />
        <div className="h-11 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}

export function CartPageContent({ lines, onClear, deliveryArea }: CartPageContentProps) {
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
          <Button onClick={onClear} type="button" variant="outline">
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
        <FulfillmentPicker deliveryArea={deliveryArea} />
        <CartSummary isDeliveryAvailable={deliveryArea !== null} />
        <CheckoutButton isDeliveryAvailable={deliveryArea !== null} />
      </div>
    </div>
  );
}

export function CartPageClient({ deliveryArea }: { deliveryArea: DeliveryArea | null }) {
  const lines = useCartStore((state) => state.lines);
  const clear = useCartStore((state) => state.clear);
  const isHydrated = useCartHydrated();

  // Stripe's cancel_url sends the shopper back here as a full document load, so the persisted cart
  // is still unread on the server render. Showing the skeleton until then keeps a stocked cart from
  // being announced as empty.
  if (!isHydrated) {
    return <CartPageSkeleton />;
  }

  return <CartPageContent deliveryArea={deliveryArea} lines={lines} onClear={clear} />;
}
