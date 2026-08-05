import { AlertTriangle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { MarkOrderShippedButton } from "@/components/admin/mark-order-shipped-button";
import { ResolveInventoryExceptionButton } from "@/components/admin/resolve-inventory-exception-button";
import { RetryOrderConfirmationButton } from "@/components/admin/retry-order-confirmation-button";
import {
  DisputeStatusBadge,
  OrderInventoryStatusBadge,
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
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";

export type PeekableOrder = NonNullable<Awaited<ReturnType<typeof getAdminOrderById>>>;

/**
 * Order preview shared by the desktop split pane and the mobile bottom sheet.
 * Presentational only — the container owns layout, scrolling, and dismissal.
 */
export function OrderPeek({ order }: { order: PeekableOrder }) {
  const shippingAddressLines = getShippingAddressLines(order.shippingAddress);
  const canFulfill = isOrderFulfillmentEligible(order);
  const delivery = order.confirmationDelivery;

  return (
    // On the desktop pane this fills the fixed column height so the items
    // region absorbs the slack; in the mobile sheet it flows normally.
    <div className="flex flex-col divide-y lg:h-full">
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <OrderStatusBadge status={order.status} />
          <OrderInventoryStatusBadge status={order.inventoryStatus} />
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

        <div className="flex flex-wrap items-center gap-2">
          {order.inventoryStatus === "allocated" && canFulfill ? (
            <MarkOrderShippedButton orderId={order.id} />
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href={`/admin/orders/${order.id}` as Route} prefetch={false}>
              Open full order
            </Link>
          </Button>
        </div>
      </div>

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

      <div className="p-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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

      <div className="p-4">
        <dl className="space-y-1.5 text-sm">
          <PeekRow label="Customer">
            <a className="underline-offset-4 hover:underline" href={`mailto:${order.email}`}>
              {order.email}
            </a>
          </PeekRow>
          <PeekRow label="Ship to">
            {shippingAddressLines.length > 0 ? (
              <address className="not-italic">{shippingAddressLines.join(", ")}</address>
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </PeekRow>
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

      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            Confirmation email
          </h3>
          {delivery && delivery.status !== "sent" ? (
            <RetryOrderConfirmationButton orderId={order.id} />
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

      <div className="p-4">
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
