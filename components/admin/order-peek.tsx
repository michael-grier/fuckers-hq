import { AlertTriangle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { FulfillmentActionButton } from "@/components/admin/fulfillment-action-button";
import { ResolveInventoryExceptionButton } from "@/components/admin/resolve-inventory-exception-button";
import { RetryOrderEmailButton } from "@/components/admin/retry-order-email-button";
import { ReturnOrderInventoryButton } from "@/components/admin/return-order-inventory-button";
import {
  DisputeStatusBadge,
  FulfillmentMethodBadge,
  OrderInventoryStatusBadge,
  OrderRestockRequiredBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  formatAdminDate,
  formatConfirmationDeliveryError,
  formatConfirmationDeliveryStatus,
  formatOptionalAdminDate,
} from "@/lib/admin/format";
import type { getAdminOrderById } from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import { resolveNextFulfillmentTransition } from "@/lib/orders/order-fulfillment";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import { orderNeedsInventoryReturn } from "@/lib/orders/return-order-inventory";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";
import { resolveOrderTracking } from "@/lib/orders/shipping-carriers";

export type PeekableOrder = NonNullable<Awaited<ReturnType<typeof getAdminOrderById>>>;

/**
 * Order preview shared by the desktop split pane and the mobile bottom sheet.
 * Presentational only — the container owns layout, scrolling, and dismissal.
 */
export function OrderPeek({ order }: { order: PeekableOrder }) {
  const shippingAddressLines = getShippingAddressLines(order.shippingAddress);
  const canFulfill = isOrderFulfillmentEligible(order);
  const nextTransition = resolveNextFulfillmentTransition(order);
  const delivery = order.confirmationDelivery;
  const tracking = resolveOrderTracking(order);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const needsInventoryReturn = orderNeedsInventoryReturn(order);

  return (
    // On the desktop pane this fills the fixed column height so the items
    // region absorbs the slack; in the mobile sheet it flows normally.
    <div className="flex flex-col divide-y lg:h-full">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge fulfillmentMethod={order.fulfillmentMethod} status={order.status} />
          <FulfillmentMethodBadge method={order.fulfillmentMethod} />
          {needsInventoryReturn ? (
            <OrderRestockRequiredBadge />
          ) : (
            <OrderInventoryStatusBadge status={order.inventoryStatus} />
          )}
          {order.refundStatus !== "none" ? <RefundStatusBadge status={order.refundStatus} /> : null}
          {order.disputeStatus !== "none" ? (
            <DisputeStatusBadge status={order.disputeStatus} />
          ) : null}
          <time
            className="ml-auto text-muted-foreground text-xs"
            dateTime={order.createdAt.toISOString()}
          >
            {formatAdminDate(order.createdAt)}
          </time>
        </div>

        {/* Keep the open shipping form on its own row so validation text cannot shift the link. */}
        <div className="flex flex-wrap items-center gap-2 [&>form]:w-full [&>form]:shrink-0">
          {order.inventoryStatus === "allocated" && canFulfill && nextTransition ? (
            <FulfillmentActionButton orderId={order.id} size="sm" transition={nextTransition} />
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/orders/${order.id}` as Route} prefetch={false}>
              Open full order
            </Link>
          </Button>
        </div>
      </div>

      {needsInventoryReturn ? (
        <div className="border-red-600 border-y-2 bg-red-50 p-4 text-red-950">
          <p className="flex items-center gap-2 font-semibold text-sm">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0 text-red-700" />
            Stock action required
          </p>
          <p className="mt-1.5 text-xs leading-5">
            This refund left {itemCount} {itemCount === 1 ? "unit" : "units"} out of sellable stock.
            Return the whole order only if every item can be sold again.
          </p>
          <div className="mt-3">
            <ReturnOrderInventoryButton itemCount={itemCount} orderId={order.id} size="sm" />
          </div>
        </div>
      ) : null}

      {order.inventoryStatus === "exception" ? (
        <div className="bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-semibold text-destructive text-sm">
            <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
            Inventory exception — do not fulfill
          </p>
          <p className="mt-1.5 text-muted-foreground text-xs">
            Payment is recorded but stock could not be allocated. Restock and retry, or refund in
            Stripe.
          </p>
          {canFulfill ? <ResolveInventoryExceptionButton orderId={order.id} /> : null}
        </div>
      ) : null}

      {/* Grows into the pane's spare height and scrolls when an order has many
          lines. The 8rem floor (rather than min-h-0) keeps several rows visible
          on short viewports, where the blocks below would otherwise squeeze this
          region to a single line.

          Below lg the sheet scrolls as one document and this list is unbounded,
          so a long order would push the totals off-screen; the max-lg ordering
          below lifts them above the list. */}
      <div className="p-4 max-lg:order-2 lg:min-h-32 lg:flex-1 lg:overflow-y-auto">
        <h3 className="mb-2 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          Items ({order.items.length})
        </h3>
        <ul className="space-y-2.5">
          {order.items.map((item) => (
            <li className="flex justify-between gap-3 text-sm" key={item.id}>
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.productNameSnapshot}</span>
                <span className="block text-muted-foreground text-xs">
                  {item.variantNameSnapshot} · Qty {item.quantity}
                </span>
              </span>
              <span className="whitespace-nowrap tabular-nums">
                {formatMoney(item.unitPriceCentsSnapshot * item.quantity, order.currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-4 max-lg:order-1">
        <dl className="space-y-1.5 text-sm">
          <PeekRow label="Customer">
            <a className="underline-offset-4 hover:underline" href={`mailto:${order.email}`}>
              {order.email}
            </a>
          </PeekRow>
          <PeekRow label={order.fulfillmentMethod === "delivery" ? "Deliver to" : "Ship to"}>
            {shippingAddressLines.length > 0 ? (
              <address className="not-italic">{shippingAddressLines.join(", ")}</address>
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </PeekRow>
          {tracking ? (
            <PeekRow label="Tracking">
              {tracking.trackingUrl ? (
                <a
                  className="break-all font-mono text-xs underline-offset-4 hover:underline"
                  href={tracking.trackingUrl}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  {tracking.carrierName} {tracking.trackingNumber}
                </a>
              ) : (
                <span className="break-all font-mono text-xs">
                  {tracking.carrierName} {tracking.trackingNumber}
                </span>
              )}
            </PeekRow>
          ) : null}
          <PeekRow label="Subtotal">{formatMoney(order.subtotalCents, order.currency)}</PeekRow>
          <PeekRow label="Shipping">{formatMoney(order.shippingCents, order.currency)}</PeekRow>
          <PeekRow label="Tax">{formatMoney(order.taxCents, order.currency)}</PeekRow>
          <div className="flex items-center justify-between gap-4 border-t pt-2 font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatMoney(order.totalCents, order.currency)}</dd>
          </div>
          {order.refundedCents > 0 ? (
            <>
              <PeekRow label="Refunded">
                −{formatMoney(order.refundedCents, order.currency)}
              </PeekRow>
              <PeekRow label="Net paid">
                {formatMoney(order.totalCents - order.refundedCents, order.currency)}
              </PeekRow>
            </>
          ) : null}
        </dl>
      </div>

      <div className="p-4 max-lg:order-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Confirmation email
          </h3>
          {delivery && delivery.status !== "sent" ? (
            <RetryOrderEmailButton kind="confirmation" orderId={order.id} />
          ) : null}
        </div>
        {delivery ? (
          <dl className="mt-2 space-y-1.5 text-sm">
            <PeekRow label="Status">{formatConfirmationDeliveryStatus(delivery.status)}</PeekRow>
            <PeekRow label="Attempts">{delivery.attemptCount}</PeekRow>
            <PeekRow label="Delivered">{formatOptionalAdminDate(delivery.deliveredAt)}</PeekRow>
            {delivery.status !== "sent" ? (
              <>
                <PeekRow label="Last attempt">
                  {formatOptionalAdminDate(delivery.lastAttemptAt)}
                </PeekRow>
                <PeekRow label="Last error">
                  {formatConfirmationDeliveryError(delivery.lastErrorCode)}
                </PeekRow>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="mt-2 text-muted-foreground text-sm">No delivery record for this order.</p>
        )}
      </div>

      <div className="p-4 max-lg:order-4">
        <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
          Stripe references
        </h3>
        <dl className="mt-2 space-y-1.5 text-sm">
          <PeekRow label="Session">
            <span className="break-all font-mono text-xs">{order.stripeSessionId}</span>
          </PeekRow>
          <PeekRow label="Payment intent">
            <span className="break-all font-mono text-xs">
              {order.stripePaymentIntentId ?? "Not recorded"}
            </span>
          </PeekRow>
        </dl>
      </div>
    </div>
  );
}

function PeekRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}
