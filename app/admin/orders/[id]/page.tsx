import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkOrderShippedButton } from "@/components/admin/mark-order-shipped-button";
import { ResolveInventoryExceptionButton } from "@/components/admin/resolve-inventory-exception-button";
import { RetryOrderConfirmationButton } from "@/components/admin/retry-order-confirmation-button";
import {
  DisputeStatusBadge,
  OrderInventoryStatusBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from "@/components/admin/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatAdminDate } from "@/lib/admin/format";
import { getAdminOrderById } from "@/lib/admin/queries";
import type { OrderConfirmationDelivery } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";

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
            <h1 className="font-black text-4xl tracking-normal">{order.orderNumber}</h1>
            <OrderStatusBadge status={order.status} />
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
          <p className="font-black text-3xl">{formatMoney(order.totalCents, order.currency)}</p>
          {order.inventoryStatus === "allocated" && isOrderFulfillmentEligible(order) ? (
            <MarkOrderShippedButton orderId={order.id} />
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
            Shipping address
          </h2>
          {shippingAddressLines.length > 0 ? (
            <address className="mt-3 not-italic text-muted-foreground">
              {shippingAddressLines.map((line) => (
                <span className="block" key={line}>
                  {line}
                </span>
              ))}
            </address>
          ) : (
            <p className="mt-3 text-muted-foreground">No shipping address was recorded.</p>
          )}
        </section>
      </div>

      <section
        aria-labelledby="confirmation-delivery-heading"
        className="rounded-lg border bg-background p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-bold text-xl" id="confirmation-delivery-heading">
                Confirmation email
              </h2>
              {order.confirmationDelivery ? (
                <ConfirmationDeliveryBadge status={order.confirmationDelivery.status} />
              ) : null}
            </div>
            {order.confirmationDelivery ? (
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <DeliveryDetail
                  label="Attempts"
                  value={order.confirmationDelivery.attemptCount.toString()}
                />
                <DeliveryDetail
                  label="Last attempt"
                  value={formatOptionalDate(order.confirmationDelivery.lastAttemptAt)}
                />
                <DeliveryDetail
                  label="Delivered"
                  value={formatOptionalDate(order.confirmationDelivery.deliveredAt)}
                />
                <DeliveryDetail
                  label="Last error"
                  value={formatDeliveryError(order.confirmationDelivery.lastErrorCode)}
                />
              </dl>
            ) : (
              <p className="mt-3 text-muted-foreground text-sm">
                No confirmation delivery record exists for this order.
              </p>
            )}
          </div>
          {order.confirmationDelivery?.status !== "sent" && order.confirmationDelivery ? (
            <RetryOrderConfirmationButton orderId={order.id} />
          ) : null}
        </div>
      </section>

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

type ConfirmationDeliveryStatus = OrderConfirmationDelivery["status"];

const confirmationDeliveryLabels: Record<ConfirmationDeliveryStatus, string> = {
  pending: "Pending",
  processing: "Sending",
  retry: "Retry scheduled",
  sent: "Sent",
  failed: "Needs attention",
};

function ConfirmationDeliveryBadge({ status }: { status: ConfirmationDeliveryStatus }) {
  return <Badge variant="outline">{confirmationDeliveryLabels[status]}</Badge>;
}

function DeliveryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}

function formatOptionalDate(value: Date | null): string {
  return value ? formatAdminDate(value) : "Not yet";
}

function formatDeliveryError(errorCode: string | null): string {
  if (!errorCode) {
    return "None";
  }

  const labels: Record<string, string> = {
    configuration_error: "Email configuration",
    delivery_error: "Delivery unavailable",
    legacy_delivery_unknown: "Pre-outbox delivery unknown",
    provider_error: "Provider rejected delivery",
  };

  return labels[errorCode] ?? "Delivery unavailable";
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
