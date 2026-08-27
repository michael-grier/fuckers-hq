"use client";

import { getCartSubtotalCents, resolveFulfillmentMethod } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import { formatMoney } from "@/lib/money";

type CartSummaryProps = {
  isDeliveryAvailable?: boolean;
  /** Sidebar variant: no card chrome, and tax detail is deferred to Stripe's own page. */
  compact?: boolean;
};

export function CartSummary({ isDeliveryAvailable = false, compact = false }: CartSummaryProps) {
  const lines = useCartStore((state) => state.lines);
  const fulfillmentPreference = useCartStore((state) => state.fulfillmentMethod);
  const deliveryEligibility = useCartStore((state) => state.deliveryEligibility);
  const subtotal = getCartSubtotalCents(lines);
  const isDelivery =
    resolveFulfillmentMethod(
      fulfillmentPreference,
      isDeliveryAvailable && deliveryEligibility !== null,
    ) === "delivery";
  const fulfillmentLabel = isDelivery ? "Delivery" : "Shipping";
  const fulfillmentValue = isDelivery ? "Free" : "Calculated at checkout";

  if (compact) {
    return (
      <dl className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-bold">{formatMoney(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{fulfillmentLabel}</dt>
          <dd className="font-bold">{fulfillmentValue}</dd>
        </div>
      </dl>
    );
  }

  return (
    <aside className="h-fit rounded-lg border p-5">
      <h2 className="font-grotesk font-semibold text-2xl">Summary</h2>
      <dl className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="font-bold">{formatMoney(subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{fulfillmentLabel}</dt>
          <dd className="font-bold">{fulfillmentValue}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Tax</dt>
          <dd className="font-bold">Calculated by Stripe</dd>
        </div>
      </dl>
    </aside>
  );
}
