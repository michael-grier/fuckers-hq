import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FulfillmentActionButton } from "@/components/admin/fulfillment-action-button";
import { ResolveInventoryExceptionButton } from "@/components/admin/resolve-inventory-exception-button";
import { RetryOrderEmailButton } from "@/components/admin/retry-order-email-button";
import {
  DisputeStatusBadge,
  FulfillmentMethodBadge,
  OrderInventoryStatusBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatAdminDate,
  formatConfirmationDeliveryError,
  formatConfirmationDeliveryStatus,
  formatOptionalAdminDate,
} from "@/lib/admin/format";
import { getAdminOrderById } from "@/lib/admin/queries";
import type { OrderEmailDelivery, OrderEmailKind } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { resolveNextFulfillmentTransition } from "@/lib/orders/order-fulfillment";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";
import { resolveOrderTracking } from "@/lib/orders/shipping-carriers";

type AdminOrderPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AdminOrderPage({ params }: AdminOrderPageProps) {
  const { id } = await params;
  const order = await getAdminOrderById(id);

  if (!order) {
    notFound();
  }

  const shippingAddressLines = getShippingAddressLines(order.shippingAddress);
  const isDelivery = order.fulfillmentMethod === "delivery";
  const nextTransition = resolveNextFulfillmentTransition(order);
  const tracking = resolveOrderTracking(order);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Button asChild className="-ml-3" size="sm" variant="ghost">
            <Link href={"/admin/orders" as Route} prefetch={false}>
              ← Back to orders
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-grotesk font-semibold text-4xl tracking-tight">
              {order.orderNumber}
            </h1>
            <OrderStatusBadge fulfillmentMethod={order.fulfillmentMethod} status={order.status} />
            <FulfillmentMethodBadge method={order.fulfillmentMethod} />
            <OrderInventoryStatusBadge status={order.inventoryStatus} />
            {order.refundStatus !== "none" ? (
              <RefundStatusBadge status={order.refundStatus} />
            ) : null}
            {order.disputeStatus !== "none" ? (
              <DisputeStatusBadge status={order.disputeStatus} />
            ) : null}
          </div>
          <p className="text-muted-foreground">
            Created{" "}
            <time dateTime={order.createdAt.toISOString()}>{formatAdminDate(order.createdAt)}</time>
          </p>
        </div>
        <div className="space-y-4 sm:text-right">
          <p className="font-grotesk font-semibold text-3xl">
            {formatMoney(order.totalCents, order.currency)}
          </p>
          {order.inventoryStatus === "allocated" &&
          isOrderFulfillmentEligible(order) &&
          nextTransition ? (
            <FulfillmentActionButton orderId={order.id} transition={nextTransition} />
          ) : null}
        </div>
      </div>

      {order.inventoryStatus === "exception" ? (
        <section
          aria-labelledby="inventory-exception-heading"
          className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-950"
        >
          <h2 className="font-bold text-xl" id="inventory-exception-heading">
            Inventory exception — do not fulfill
          </h2>
          <p className="mt-2 max-w-3xl text-sm">
            Stripe payment is recorded, but stock could not be allocated. Reconcile this paid order
            by restocking the affected variants and retrying allocation, or refund it in Stripe. The
            order cannot be marked as shipped while this exception remains.
          </p>
          {isOrderFulfillmentEligible(order) ? (
            <ResolveInventoryExceptionButton orderId={order.id} />
          ) : null}
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="customer-heading" className="rounded-lg border bg-background p-6">
          <h2 className="font-bold text-xl" id="customer-heading">
            Customer
          </h2>
          <a
            className="mt-3 inline-block underline-offset-4 hover:underline"
            href={`mailto:${order.email}`}
          >
            {order.email}
          </a>
        </section>
        <section aria-labelledby="shipping-heading" className="rounded-lg border bg-background p-6">
          <h2 className="font-bold text-xl" id="shipping-heading">
            {isDelivery ? "Delivery address" : "Shipping address"}
          </h2>
          {isDelivery ? (
            <div className="mt-3 space-y-3 text-muted-foreground">
              {shippingAddressLines.length > 0 ? (
                <address className="not-italic">
                  {shippingAddressLines.map((line) => (
                    <span className="block" key={line}>
                      {line}
                    </span>
                  ))}
                </address>
              ) : (
                <p>No delivery address was recorded.</p>
              )}
              {order.deliveryScheduledAt ? (
                <p>
                  Delivery scheduled{" "}
                  <time dateTime={order.deliveryScheduledAt.toISOString()}>
                    {formatAdminDate(order.deliveryScheduledAt)}
                  </time>
                </p>
              ) : (
                <p>Not yet scheduled for delivery.</p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-3 text-muted-foreground">
              {shippingAddressLines.length > 0 ? (
                <address className="not-italic">
                  {shippingAddressLines.map((line) => (
                    <span className="block" key={line}>
                      {line}
                    </span>
                  ))}
                </address>
              ) : (
                <p>No shipping address was recorded.</p>
              )}
              {order.shippedAt ? (
                <p>
                  Shipped{" "}
                  <time dateTime={order.shippedAt.toISOString()}>
                    {formatAdminDate(order.shippedAt)}
                  </time>
                </p>
              ) : (
                <p>Not yet marked as shipped.</p>
              )}
              {tracking ? (
                <p>
                  <span className="block font-semibold text-foreground">
                    {tracking.carrierName}
                  </span>
                  {tracking.trackingUrl ? (
                    <a
                      className="font-mono text-sm underline-offset-4 hover:underline"
                      href={tracking.trackingUrl}
                      rel="noreferrer noopener"
                      target="_blank"
                    >
                      {tracking.trackingNumber}
                    </a>
                  ) : (
                    <span className="font-mono text-sm">{tracking.trackingNumber}</span>
                  )}
                </p>
              ) : order.shippedAt ? (
                <p>Shipped without a tracking number.</p>
              ) : null}
            </div>
          )}
        </section>
      </div>

      <EmailDeliverySection
        delivery={order.confirmationDelivery}
        emptyMessage="No confirmation delivery record exists for this order."
        heading="Confirmation email"
        id="confirmation-delivery"
        kind="confirmation"
        orderId={order.id}
      />

      {isDelivery ? (
        <EmailDeliverySection
          delivery={order.deliveryScheduledDelivery}
          emptyMessage="This order has not been scheduled for delivery yet, so no delivery email is queued."
          heading="Delivery email"
          id="delivery-scheduled-delivery"
          kind="delivery_scheduled"
          orderId={order.id}
        />
      ) : (
        <EmailDeliverySection
          delivery={order.shippedDelivery}
          emptyMessage="This order has not been marked as shipped yet, so no shipping email is queued."
          heading="Shipping email"
          id="shipped-delivery"
          kind="shipped"
          orderId={order.id}
        />
      )}

      <section aria-labelledby="items-heading" className="space-y-4">
        <h2 className="font-bold text-2xl" id="items-heading">
          Items
        </h2>
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-2xl text-left text-sm">
            <caption className="sr-only">Persisted order item snapshots</caption>
            <thead className="border-b bg-muted/50">
              <tr>
                <TableHeading>Product</TableHeading>
                <TableHeading>Variant</TableHeading>
                <TableHeading>Unit price</TableHeading>
                <TableHeading>Quantity</TableHeading>
                <TableHeading>Line total</TableHeading>
              </tr>
            </thead>
            <tbody className="divide-y">
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-4 font-semibold">{item.productNameSnapshot}</td>
                  <td className="px-4 py-4">{item.variantNameSnapshot}</td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {formatMoney(item.unitPriceCentsSnapshot, order.currency)}
                  </td>
                  <td className="px-4 py-4">{item.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-4 font-semibold">
                    {formatMoney(item.unitPriceCentsSnapshot * item.quantity, order.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="payment-heading" className="rounded-lg border bg-background p-6">
          <h2 className="font-bold text-xl" id="payment-heading">
            Stripe references
          </h2>
          <dl className="mt-4 space-y-4 text-sm">
            <ReferenceRow label="Checkout Session" value={order.stripeSessionId} />
            <ReferenceRow
              label="Payment Intent"
              value={order.stripePaymentIntentId ?? "Not recorded"}
            />
          </dl>
        </section>

        <section aria-labelledby="totals-heading" className="rounded-lg border bg-background p-6">
          <h2 className="font-bold text-xl" id="totals-heading">
            Totals
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <TotalRow label="Subtotal" value={formatMoney(order.subtotalCents, order.currency)} />
            <TotalRow label="Shipping" value={formatMoney(order.shippingCents, order.currency)} />
            <TotalRow label="Tax" value={formatMoney(order.taxCents, order.currency)} />
            <div className="flex items-center justify-between border-t pt-3 font-bold text-base">
              <dt>Total</dt>
              <dd>{formatMoney(order.totalCents, order.currency)}</dd>
            </div>
            <TotalRow label="Refunded" value={formatMoney(order.refundedCents, order.currency)} />
            <TotalRow
              label="Net paid"
              value={formatMoney(order.totalCents - order.refundedCents, order.currency)}
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              <dt className="text-muted-foreground">Dispute</dt>
              <dd>
                <DisputeStatusBadge status={order.disputeStatus} />
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}

type EmailDeliverySectionProps = {
  delivery: OrderEmailDelivery | null;
  emptyMessage: string;
  heading: string;
  id: string;
  kind: OrderEmailKind;
  orderId: string;
};

function EmailDeliverySection({
  delivery,
  emptyMessage,
  heading,
  id,
  kind,
  orderId,
}: EmailDeliverySectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-lg border bg-background p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-xl" id={`${id}-heading`}>
              {heading}
            </h2>
            {delivery ? <ConfirmationDeliveryBadge status={delivery.status} /> : null}
          </div>
          {delivery ? (
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <DeliveryDetail label="Attempts" value={delivery.attemptCount.toString()} />
              <DeliveryDetail
                label="Last attempt"
                value={formatOptionalAdminDate(delivery.lastAttemptAt)}
              />
              <DeliveryDetail
                label="Delivered"
                value={formatOptionalAdminDate(delivery.deliveredAt)}
              />
              <DeliveryDetail
                label="Last error"
                value={formatConfirmationDeliveryError(delivery.lastErrorCode)}
              />
            </dl>
          ) : (
            <p className="mt-3 text-muted-foreground text-sm">{emptyMessage}</p>
          )}
        </div>
        {delivery && delivery.status !== "sent" ? (
          <RetryOrderEmailButton kind={kind} orderId={orderId} />
        ) : null}
      </div>
    </section>
  );
}

type ConfirmationDeliveryStatus = OrderEmailDelivery["status"];

function ConfirmationDeliveryBadge({ status }: { status: ConfirmationDeliveryStatus }) {
  return <Badge variant="outline">{formatConfirmationDeliveryStatus(status)}</Badge>;
}

function DeliveryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
      {children}
    </th>
  );
}

function ReferenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-mono text-xs">{value}</dd>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
