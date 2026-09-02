import { AlertTriangle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeliveryReviewPanel } from "@/components/admin/delivery-review-panel";
import { FulfillmentActionButton } from "@/components/admin/fulfillment-action-button";
import { ResolveInventoryExceptionButton } from "@/components/admin/resolve-inventory-exception-button";
import { RetryOrderEmailButton } from "@/components/admin/retry-order-email-button";
import { ReturnOrderInventoryButton } from "@/components/admin/return-order-inventory-button";
import {
  DeliveryReviewStatusBadge,
  DisputeStatusBadge,
  FulfillmentMethodBadge,
  OrderInventoryStatusBadge,
  OrderRestockRequiredBadge,
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
import type {
  OrderEmailDelivery,
  OrderEmailKind,
  OrderShippingPaymentRequest,
} from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { resolveNextFulfillmentTransition } from "@/lib/orders/order-fulfillment";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import { orderNeedsInventoryReturn } from "@/lib/orders/return-order-inventory";
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

  const fulfillmentAddress =
    order.fulfillmentMethod === "shipping" && order.shippingPaymentRequest?.shippingAddress
      ? order.shippingPaymentRequest.shippingAddress
      : order.shippingAddress;
  const shippingAddressLines = getShippingAddressLines(fulfillmentAddress);
  const isDelivery = order.fulfillmentMethod === "delivery";
  const nextTransition = resolveNextFulfillmentTransition(order);
  const tracking = resolveOrderTracking(order);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const needsInventoryReturn = orderNeedsInventoryReturn(order);

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
            {order.deliveryReviewStatus ? (
              <DeliveryReviewStatusBadge status={order.deliveryReviewStatus} />
            ) : null}
            {needsInventoryReturn ? (
              <OrderRestockRequiredBadge />
            ) : (
              <OrderInventoryStatusBadge status={order.inventoryStatus} />
            )}
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

      {order.deliveryReviewStatus ? (
        <DeliveryReviewPanel
          addressLines={shippingAddressLines}
          orderId={order.id}
          paymentDelivery={order.shippingPaymentDelivery}
          paymentRequest={order.shippingPaymentRequest}
          status={order.deliveryReviewStatus}
        />
      ) : null}

      {order.shippingPaymentRequests.length > 1 ||
      order.deliveryReviewStatus === "shipping_payment_exception" ? (
        <ShippingPaymentHistory requests={order.shippingPaymentRequests} />
      ) : null}

      {needsInventoryReturn ? (
        <section
          aria-labelledby="inventory-return-heading"
          className="overflow-hidden rounded-lg border-2 border-red-600 bg-background shadow-[0_8px_28px_rgba(185,28,28,0.12)]"
        >
          <div className="flex flex-wrap items-start gap-4 bg-red-600 px-6 py-3 text-white">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            <div>
              <h2 className="font-bold text-lg" id="inventory-return-heading">
                Stock action required
              </h2>
              <p className="mt-0.5 text-red-50 text-sm">
                This refund did not return the order's units to sellable inventory.
              </p>
            </div>
            <span className="ml-auto rounded-full bg-white/15 px-3 py-1 font-semibold text-xs">
              Needs attention
            </span>
          </div>
          <div className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-end">
            <div>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                If every item is physically sellable, return all {itemCount}{" "}
                {itemCount === 1 ? "unit" : "units"} to stock. Do not use this for damaged, lost, or
                customer-kept items.
              </p>
              <p className="mt-3 font-semibold text-red-800 text-xs">
                This returns the entire order. Individual lines cannot be selected.
              </p>
            </div>
            <ReturnOrderInventoryButton itemCount={itemCount} orderId={order.id} />
          </div>
        </section>
      ) : null}

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
        currency={order.currency}
        delivery={order.confirmationDelivery}
        emptyMessage="No confirmation delivery record exists for this order."
        heading="Confirmation email"
        id="confirmation-delivery"
        kind="confirmation"
        orderId={order.id}
      />

      <EmailDeliverySection
        currency={order.currency}
        delivery={order.adminNewOrderDelivery}
        emptyMessage="No admin sale notification exists for this order."
        heading="Admin sale notification"
        id="admin-new-order-delivery"
        kind="admin_new_order"
        orderId={order.id}
      />

      {order.shippingPaymentRequest || order.shippingPaymentDelivery ? (
        <EmailDeliverySection
          currency={order.currency}
          delivery={order.shippingPaymentDelivery}
          emptyMessage="No shipping payment request email is queued for this order."
          heading="Shipping payment request email"
          id="shipping-payment-delivery"
          kind="shipping_payment_request"
          orderId={order.id}
        />
      ) : null}

      {order.refundDeliveries.map((delivery, index) => (
        <EmailDeliverySection
          currency={order.currency}
          delivery={delivery}
          emptyMessage=""
          heading={`Refund email #${order.refundDeliveries.length - index}`}
          id={`refund-delivery-${delivery.id}`}
          key={delivery.id}
          kind="refund"
          orderId={order.id}
        />
      ))}

      {isDelivery ? (
        <EmailDeliverySection
          currency={order.currency}
          delivery={order.deliveryScheduledDelivery}
          emptyMessage="This order has not been scheduled for delivery yet, so no delivery email is queued."
          heading="Delivery email"
          id="delivery-scheduled-delivery"
          kind="delivery_scheduled"
          orderId={order.id}
        />
      ) : (
        <EmailDeliverySection
          currency={order.currency}
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
            {order.shippingPaymentRequest ? (
              <>
                <ReferenceRow
                  label="Shipping Checkout Session"
                  value={order.shippingPaymentRequest.stripeSessionId ?? "Not created"}
                />
                <ReferenceRow
                  label="Shipping Payment Intent"
                  value={order.shippingPaymentRequest.stripePaymentIntentId ?? "Not paid"}
                />
              </>
            ) : null}
          </dl>
        </section>

        <section aria-labelledby="totals-heading" className="rounded-lg border bg-background p-6">
          <h2 className="font-bold text-xl" id="totals-heading">
            Totals
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <TotalRow
              label="Original subtotal"
              value={formatMoney(order.subtotalCents, order.currency)}
            />
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
            {order.shippingPaymentRequest?.totalCents !== null &&
            order.shippingPaymentRequest?.totalCents !== undefined ? (
              <>
                <TotalRow
                  label="Supplemental shipping paid"
                  value={formatMoney(
                    order.shippingPaymentRequest.totalCents,
                    order.shippingPaymentRequest.currency,
                  )}
                />
                {order.shippingPaymentRequest.refundedCents > 0 ? (
                  <TotalRow
                    label="Supplemental shipping refunded"
                    value={formatMoney(
                      order.shippingPaymentRequest.refundedCents,
                      order.shippingPaymentRequest.currency,
                    )}
                  />
                ) : null}
              </>
            ) : null}
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
  currency: string;
  delivery: OrderEmailDelivery | null;
  emptyMessage: string;
  heading: string;
  id: string;
  kind: OrderEmailKind;
  orderId: string;
};

function EmailDeliverySection({
  currency,
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
              {kind === "refund" &&
              delivery.refundAmountCents !== null &&
              delivery.refundCumulativeCents !== null ? (
                <>
                  <DeliveryDetail
                    label="Refunded this time"
                    value={formatMoney(delivery.refundAmountCents, currency)}
                  />
                  <DeliveryDetail
                    label="Total refunded"
                    value={formatMoney(delivery.refundCumulativeCents, currency)}
                  />
                </>
              ) : null}
            </dl>
          ) : (
            <p className="mt-3 text-muted-foreground text-sm">{emptyMessage}</p>
          )}
        </div>
        {delivery && delivery.status !== "sent" && delivery.status !== "cancelled" ? (
          <RetryOrderEmailButton deliveryId={delivery.id} kind={kind} orderId={orderId} />
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

function ShippingPaymentHistory({ requests }: { requests: OrderShippingPaymentRequest[] }) {
  return (
    <section aria-labelledby="shipping-payment-history-heading" className="space-y-4">
      <div>
        <h2 className="font-bold text-2xl" id="shipping-payment-history-heading">
          Shipping payment history
        </h2>
        <p className="mt-1 text-muted-foreground text-sm">
          Every link generation is retained so late or duplicate payments can be reconciled.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-background">
        <table className="w-full min-w-4xl text-left text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <TableHeading>Generation</TableHeading>
              <TableHeading>Status</TableHeading>
              <TableHeading>Amount</TableHeading>
              <TableHeading>Refund / dispute</TableHeading>
              <TableHeading>Stripe references</TableHeading>
            </tr>
          </thead>
          <tbody className="divide-y">
            {requests.map((request) => (
              <tr key={request.id}>
                <td className="whitespace-nowrap px-4 py-4">
                  <span className="font-semibold">#{request.generation}</span>
                  <span className="mt-1 block text-muted-foreground text-xs">
                    {formatAdminDate(request.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-4 capitalize">{request.status.replaceAll("_", " ")}</td>
                <td className="whitespace-nowrap px-4 py-4">
                  {formatMoney(request.totalCents ?? request.amountCents, request.currency)}
                  {request.totalCents === null ? (
                    <span className="block text-muted-foreground text-xs">plus applicable tax</span>
                  ) : null}
                </td>
                <td className="px-4 py-4">
                  <span className="block capitalize">Refund: {request.refundStatus}</span>
                  <span className="block capitalize">Dispute: {request.disputeStatus}</span>
                </td>
                <td className="max-w-sm px-4 py-4 font-mono text-xs">
                  <span className="block break-all">{request.stripeSessionId ?? "No Session"}</span>
                  <span className="mt-1 block break-all text-muted-foreground">
                    {request.stripePaymentIntentId ?? "No Payment Intent"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
