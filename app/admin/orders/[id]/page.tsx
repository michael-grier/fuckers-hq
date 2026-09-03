import { AlertTriangle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DeliveryReviewPanel } from "@/components/admin/delivery-review-panel";
import { FulfillmentActionButton } from "@/components/admin/fulfillment-action-button";
import { ResolveInventoryExceptionButton } from "@/components/admin/resolve-inventory-exception-button";
import { RetryOrderEmailButton } from "@/components/admin/retry-order-email-button";
import { ReturnOrderInventoryButton } from "@/components/admin/return-order-inventory-button";
import { ShippingRecordEditor } from "@/components/admin/shipping-record-editor";
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
import {
  type OrderFulfillmentTransition,
  resolveNextFulfillmentTransition,
} from "@/lib/orders/order-fulfillment";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import { orderNeedsInventoryReturn } from "@/lib/orders/return-order-inventory";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";
import { resolveOrderTracking } from "@/lib/orders/shipping-carriers";

type AdminOrderPageProps = {
  params: Promise<{
    id: string;
  }>;
};

// Describes the one transition the server permits from the order's current fulfillment state.
const fulfillmentActionCopy: Record<
  OrderFulfillmentTransition,
  { description: string; heading: string }
> = {
  ship: {
    heading: "Ready to ship",
    description: "Inventory is allocated. Buy the label and add tracking when the parcel is ready.",
  },
  schedule_delivery: {
    heading: "Ready to schedule",
    description: "The delivery address is approved. Schedule the drop-off with the customer.",
  },
  delivered: {
    heading: "Ready to complete",
    description: "Mark the order delivered after the customer receives it.",
  },
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
  const availableTransition =
    order.inventoryStatus === "allocated" && isOrderFulfillmentEligible(order)
      ? nextTransition
      : null;
  const approvedDeliveryTransition =
    isDelivery && order.deliveryReviewStatus === "approved" ? availableTransition : null;
  const standaloneFulfillmentTransition = approvedDeliveryTransition ? null : availableTransition;
  const tracking = resolveOrderTracking(order);
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const needsInventoryReturn = orderNeedsInventoryReturn(order);
  const shippingChargedCents = order.shippingPaymentRequest?.totalCents ?? order.shippingCents;

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
        <div className="sm:text-right">
          <p className="font-grotesk font-semibold text-3xl">
            {formatMoney(order.totalCents, order.currency)}
          </p>
        </div>
      </div>

      {order.deliveryReviewStatus ? (
        <DeliveryReviewPanel
          addressLines={shippingAddressLines}
          approvedAction={
            approvedDeliveryTransition ? (
              <FulfillmentActionButton orderId={order.id} transition={approvedDeliveryTransition} />
            ) : null
          }
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

      <div className="overflow-hidden rounded-lg border lg:contents">
        {standaloneFulfillmentTransition ? (
          <section
            aria-labelledby="fulfillment-action-heading"
            className="flex flex-wrap items-center justify-between gap-4 bg-muted/50 px-5 py-4 lg:rounded-lg lg:border"
          >
            <div>
              <h2 className="font-semibold" id="fulfillment-action-heading">
                {fulfillmentActionCopy[standaloneFulfillmentTransition].heading}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {fulfillmentActionCopy[standaloneFulfillmentTransition].description}
              </p>
            </div>
            <FulfillmentActionButton
              orderId={order.id}
              transition={standaloneFulfillmentTransition}
            />
          </section>
        ) : null}

        <section
          aria-labelledby="order-summary-heading"
          className={`overflow-hidden ${standaloneFulfillmentTransition ? "border-t" : ""} lg:mt-4 lg:rounded-lg lg:border`}
        >
          <h2 className="sr-only" id="order-summary-heading">
            Order summary
          </h2>
          <div className="grid md:grid-cols-2 xl:grid-cols-[1fr_1.25fr_0.8fr]">
            <div className="p-5">
              <h3 className="font-semibold text-sm">Customer</h3>
              <a
                className="mt-2 inline-block text-sm underline-offset-4 hover:underline"
                href={`mailto:${order.email}`}
              >
                {order.email}
              </a>
            </div>
            <div className="border-t p-5 md:border-l md:border-t-0">
              <h3 className="font-semibold text-sm">
                {isDelivery ? "Delivery address" : "Shipping address"}
              </h3>
              <div className="mt-2 space-y-2 text-muted-foreground text-sm">
                {shippingAddressLines.length > 0 ? (
                  <address className="not-italic">
                    {shippingAddressLines.map((line) => (
                      <span className="block" key={line}>
                        {line}
                      </span>
                    ))}
                  </address>
                ) : (
                  <p>No {isDelivery ? "delivery" : "shipping"} address was recorded.</p>
                )}
                {isDelivery ? (
                  order.deliveryScheduledAt ? (
                    <p>
                      Delivery scheduled{" "}
                      <time dateTime={order.deliveryScheduledAt.toISOString()}>
                        {formatAdminDate(order.deliveryScheduledAt)}
                      </time>
                    </p>
                  ) : (
                    <p>Not yet scheduled for delivery.</p>
                  )
                ) : order.shippedAt ? (
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
            </div>
            <div className="border-t p-5 xl:border-l xl:border-t-0">
              <h3 className="font-semibold text-sm">Payment</h3>
              <p className="mt-2 text-sm">
                {formatMoney(order.totalCents - order.refundedCents, order.currency)} net paid
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {order.refundedCents > 0
                  ? `${formatMoney(order.refundedCents, order.currency)} refunded`
                  : "No refund"}
              </p>
              {order.disputeStatus !== "none" ? (
                <div className="mt-2">
                  <DisputeStatusBadge status={order.disputeStatus} />
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground text-xs">No dispute</p>
              )}
            </div>
          </div>
        </section>

        <section
          aria-labelledby="items-heading"
          className="overflow-hidden border-t lg:mt-4 lg:rounded-lg lg:border"
        >
          <div className="flex items-center justify-between gap-4 border-b px-5 py-4">
            <h2 className="font-bold text-xl" id="items-heading">
              Items
            </h2>
            <span className="text-muted-foreground text-sm">
              {itemCount} {itemCount === 1 ? "unit" : "units"}
            </span>
          </div>
          <div className="overflow-x-auto bg-background">
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

        <section
          aria-labelledby="supporting-details-heading"
          className="overflow-hidden border-t lg:mt-4 lg:rounded-lg lg:border"
        >
          <div className="border-b px-5 py-4">
            <h2 className="font-bold text-xl" id="supporting-details-heading">
              Supporting details
            </h2>
          </div>
          <div className="grid xl:grid-cols-[1.25fr_0.75fr]">
            <div className="p-5">
              {!isDelivery ? (
                <ShippingRecordEditor
                  actualCostCents={order.shippingActualCostCents}
                  actualCostUnknown={order.shippingActualCostUnknown}
                  currency={order.currency}
                  orderId={order.id}
                  packedWeightGrams={order.packedWeightGrams}
                  packedWeightUnknown={order.packedWeightUnknown}
                  shippingChargedCents={shippingChargedCents}
                />
              ) : null}

              <div className={!isDelivery ? "pt-5" : undefined}>
                <h3 className="font-semibold">Customer emails</h3>
                <div className="mt-3 divide-y">
                  <EmailDeliveryRow
                    currency={order.currency}
                    delivery={order.confirmationDelivery}
                    emptyMessage="No confirmation delivery record exists for this order."
                    heading="Order confirmation"
                    id="confirmation-delivery"
                    kind="confirmation"
                    orderId={order.id}
                  />

                  {order.shippingPaymentRequest || order.shippingPaymentDelivery ? (
                    <EmailDeliveryRow
                      currency={order.currency}
                      delivery={order.shippingPaymentDelivery}
                      emptyMessage="No shipping payment request email is queued for this order."
                      heading="Shipping payment request"
                      id="shipping-payment-delivery"
                      kind="shipping_payment_request"
                      orderId={order.id}
                    />
                  ) : null}

                  {order.refundDeliveries.map((delivery, index) => (
                    <EmailDeliveryRow
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
                    <EmailDeliveryRow
                      currency={order.currency}
                      delivery={order.deliveryScheduledDelivery}
                      emptyMessage="Not queued until delivery is scheduled."
                      heading="Delivery confirmation"
                      id="delivery-scheduled-delivery"
                      kind="delivery_scheduled"
                      orderId={order.id}
                    />
                  ) : (
                    <EmailDeliveryRow
                      currency={order.currency}
                      delivery={order.shippedDelivery}
                      emptyMessage="Not queued until the order is marked as shipped."
                      heading="Shipping confirmation"
                      id="shipped-delivery"
                      kind="shipped"
                      orderId={order.id}
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="border-t p-5 xl:border-l xl:border-t-0">
              <h3 className="font-semibold">Totals</h3>
              <dl className="mt-4 space-y-3 text-sm">
                <TotalRow
                  label="Original subtotal"
                  value={formatMoney(order.subtotalCents, order.currency)}
                />
                <TotalRow
                  label="Shipping"
                  value={formatMoney(order.shippingCents, order.currency)}
                />
                <TotalRow label="Tax" value={formatMoney(order.taxCents, order.currency)} />
                <div className="flex items-center justify-between border-t pt-3 font-bold text-base">
                  <dt>Total</dt>
                  <dd>{formatMoney(order.totalCents, order.currency)}</dd>
                </div>
                <TotalRow
                  label="Refunded"
                  value={formatMoney(order.refundedCents, order.currency)}
                />
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

              <details className="mt-5 border-t pt-4">
                <summary className="cursor-pointer font-semibold text-sm">
                  Stripe references
                </summary>
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
              </details>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

type EmailDeliveryRowProps = {
  currency: string;
  delivery: OrderEmailDelivery | null;
  emptyMessage: string;
  heading: string;
  id: string;
  kind: OrderEmailKind;
  orderId: string;
};

/** A compact status row for one customer-facing email and its manual recovery action. */
function EmailDeliveryRow({
  currency,
  delivery,
  emptyMessage,
  heading,
  id,
  kind,
  orderId,
}: EmailDeliveryRowProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h4 className="font-semibold text-sm" id={`${id}-heading`}>
              {heading}
            </h4>
            {delivery ? <EmailDeliveryBadge status={delivery.status} /> : null}
          </div>
          {delivery ? (
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-xs">
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
            <p className="mt-2 text-muted-foreground text-xs">{emptyMessage}</p>
          )}
        </div>
        {delivery && delivery.status !== "sent" && delivery.status !== "cancelled" ? (
          <RetryOrderEmailButton deliveryId={delivery.id} kind={kind} orderId={orderId} size="sm" />
        ) : null}
      </div>
    </section>
  );
}

type ConfirmationDeliveryStatus = OrderEmailDelivery["status"];

function EmailDeliveryBadge({ status }: { status: ConfirmationDeliveryStatus }) {
  return <Badge variant="outline">{formatConfirmationDeliveryStatus(status)}</Badge>;
}

function DeliveryDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
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
