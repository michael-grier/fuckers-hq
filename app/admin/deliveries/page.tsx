import type { Route } from "next";
import Link from "next/link";

import { FulfillmentActionButton } from "@/components/admin/fulfillment-action-button";
import {
  DeliveryAddressReviewBadge,
  OrderInventoryStatusBadge,
} from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatAdminDate } from "@/lib/admin/format";
import { getAdminDeliveryQueue } from "@/lib/admin/queries";
import { resolveDeliveryArea } from "@/lib/checkout/delivery";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import type { OrderFulfillmentTransition } from "@/lib/orders/order-fulfillment";

type DeliveryQueue = Awaited<ReturnType<typeof getAdminDeliveryQueue>>;
type DeliveryOrder = DeliveryQueue["toSchedule"][number];

export default async function AdminDeliveriesPage() {
  const queue = await getAdminDeliveryQueue();
  const deliveryArea = resolveDeliveryArea(env);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Delivery queue</h1>
        <p className="text-muted-foreground">
          Paid local-delivery orders, oldest first. Scheduling an order emails the customer that
          you'll be in touch to arrange the drop-off; the delivery address is on each order.
        </p>
      </div>

      {deliveryArea ? (
        <section
          aria-labelledby="delivery-area-heading"
          className="rounded-lg border bg-background p-6"
        >
          <h2 className="font-bold text-xl" id="delivery-area-heading">
            Delivery area
          </h2>
          <div className="mt-3 space-y-2 text-muted-foreground text-sm">
            <p className="font-semibold text-foreground">{deliveryArea.areaName}</p>
            <p>
              Checkout checks each address against the stored county boundary. Orders marked Address
              review need confirmation before you schedule the drop-off.
            </p>
            {deliveryArea.instructions ? <p>{deliveryArea.instructions}</p> : null}
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="font-bold text-xl">Local delivery is not configured</h2>
          <p className="mt-2 max-w-3xl text-sm">
            New delivery orders cannot be placed until DELIVERY_ENABLED, DELIVERY_AREA_NAME, and
            DELIVERY_ELIGIBILITY_SECRET are set. Existing delivery orders below still need to be
            delivered.
          </p>
        </section>
      )}

      <DeliverySection
        description="Paid and allocated. Pack these, then schedule delivery to notify the customer."
        emptyMessage="Nothing waiting to be scheduled."
        heading="To schedule"
        id="to-schedule"
        orders={queue.toSchedule}
        transition="schedule_delivery"
      />

      <DeliverySection
        description="The customer has been emailed. Mark as delivered once the order is dropped off."
        emptyMessage="No orders are waiting to be delivered."
        heading="Awaiting delivery"
        id="awaiting-delivery"
        orders={queue.awaitingDelivery}
        showScheduledSince
        transition="delivered"
      />

      {queue.blocked.length > 0 ? (
        <DeliverySection
          description="Stock could not be allocated. Resolve the inventory exception on each order before it can be handed over."
          emptyMessage=""
          heading="Blocked"
          id="blocked"
          orders={queue.blocked}
        />
      ) : null}
    </div>
  );
}

type DeliverySectionProps = {
  description: string;
  emptyMessage: string;
  heading: string;
  id: string;
  orders: DeliveryOrder[];
  showScheduledSince?: boolean;
  transition?: OrderFulfillmentTransition;
};

function DeliverySection({
  description,
  emptyMessage,
  heading,
  id,
  orders,
  showScheduledSince = false,
  transition,
}: DeliverySectionProps) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-bold text-2xl" id={`${id}-heading`}>
          {heading} <span className="text-muted-foreground">({orders.length})</span>
        </h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>

      {orders.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-background px-6 py-8 text-center text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-3xl text-left text-sm">
            <caption className="sr-only">{heading} delivery orders, oldest first</caption>
            <thead className="border-b bg-muted/50">
              <tr>
                <TableHeading>Order</TableHeading>
                <TableHeading>Customer</TableHeading>
                <TableHeading>Items</TableHeading>
                <TableHeading>Total</TableHeading>
                <TableHeading>{showScheduledSince ? "Scheduled since" : "Paid"}</TableHeading>
                <TableHeading>
                  <span className="sr-only">Actions</span>
                </TableHeading>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((order) => (
                <tr key={order.id}>
                  <td className="whitespace-nowrap px-4 py-4 align-top font-semibold">
                    {order.orderNumber}
                    {order.inventoryStatus === "exception" ? (
                      <span className="mt-1.5 block">
                        <OrderInventoryStatusBadge status={order.inventoryStatus} />
                      </span>
                    ) : null}
                    {order.deliveryReviewRequired ? (
                      <span className="mt-1.5 block">
                        <DeliveryAddressReviewBadge />
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-4 align-top">{order.email}</td>
                  <td className="px-4 py-4 align-top">
                    {order.items.reduce((total, item) => total + item.quantity, 0)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top font-semibold">
                    {formatMoney(order.totalCents, order.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top">
                    <DeliveryTimestamp order={order} showScheduledSince={showScheduledSince} />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-wrap items-start justify-end gap-2">
                      {transition ? (
                        <FulfillmentActionButton
                          orderId={order.id}
                          size="sm"
                          transition={transition}
                        />
                      ) : null}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/admin/orders/${order.id}` as Route} prefetch={false}>
                          Details
                        </Link>
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DeliveryTimestamp({
  order,
  showScheduledSince,
}: {
  order: DeliveryOrder;
  showScheduledSince: boolean;
}) {
  const timestamp = showScheduledSince ? order.deliveryScheduledAt : order.createdAt;

  if (!timestamp) {
    return <span className="text-muted-foreground">Not recorded</span>;
  }

  return <time dateTime={timestamp.toISOString()}>{formatAdminDate(timestamp)}</time>;
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
      {children}
    </th>
  );
}
