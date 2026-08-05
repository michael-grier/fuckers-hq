import type { Route } from "next";
import Link from "next/link";

import { FulfillmentActionButton } from "@/components/admin/fulfillment-action-button";
import { OrderInventoryStatusBadge } from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatAdminDate } from "@/lib/admin/format";
import { getAdminPickupQueue } from "@/lib/admin/queries";
import { resolvePickupLocation, splitPickupAddressLines } from "@/lib/checkout/pickup";
import { env } from "@/lib/env";
import { formatMoney } from "@/lib/money";
import type { OrderFulfillmentTransition } from "@/lib/orders/order-fulfillment";

type PickupQueue = Awaited<ReturnType<typeof getAdminPickupQueue>>;
type PickupOrder = PickupQueue["toPrepare"][number];

export default async function AdminPickupsPage() {
  const queue = await getAdminPickupQueue();
  const pickupLocation = resolvePickupLocation(env);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Pickup queue</h1>
        <p className="text-muted-foreground">
          Paid local-pickup orders, oldest first. Marking an order ready emails the customer to come
          collect it.
        </p>
      </div>

      {pickupLocation ? (
        <section
          aria-labelledby="pickup-location-heading"
          className="rounded-lg border bg-background p-6"
        >
          <h2 className="font-bold text-xl" id="pickup-location-heading">
            Pickup location
          </h2>
          <address className="mt-3 not-italic text-muted-foreground text-sm">
            <span className="block font-semibold text-foreground">{pickupLocation.name}</span>
            {splitPickupAddressLines(pickupLocation.address).map((line) => (
              <span className="block" key={line}>
                {line}
              </span>
            ))}
            <span className="mt-2 block">{pickupLocation.hours}</span>
          </address>
        </section>
      ) : (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-amber-950">
          <h2 className="font-bold text-xl">Pickup is not configured</h2>
          <p className="mt-2 max-w-3xl text-sm">
            New pickup orders cannot be placed, and pickup-ready emails will fail until
            PICKUP_ENABLED, PICKUP_LOCATION_NAME, PICKUP_ADDRESS, and PICKUP_HOURS are all set.
            Existing pickup orders below still need to be handed over.
          </p>
        </section>
      )}

      <PickupSection
        description="Paid and allocated. Pack these, then mark them ready to notify the customer."
        emptyMessage="Nothing waiting to be packed."
        heading="To prepare"
        id="to-prepare"
        orders={queue.toPrepare}
        transition="ready_for_pickup"
      />

      <PickupSection
        description="The customer has been emailed. Mark as picked up once they collect it."
        emptyMessage="No orders are waiting for collection."
        heading="Awaiting collection"
        id="awaiting-collection"
        orders={queue.awaitingCollection}
        showReadySince
        transition="picked_up"
      />

      {queue.blocked.length > 0 ? (
        <PickupSection
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

type PickupSectionProps = {
  description: string;
  emptyMessage: string;
  heading: string;
  id: string;
  orders: PickupOrder[];
  showReadySince?: boolean;
  transition?: OrderFulfillmentTransition;
};

function PickupSection({
  description,
  emptyMessage,
  heading,
  id,
  orders,
  showReadySince = false,
  transition,
}: PickupSectionProps) {
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
            <caption className="sr-only">{heading} pickup orders, oldest first</caption>
            <thead className="border-b bg-muted/50">
              <tr>
                <TableHeading>Order</TableHeading>
                <TableHeading>Customer</TableHeading>
                <TableHeading>Items</TableHeading>
                <TableHeading>Total</TableHeading>
                <TableHeading>{showReadySince ? "Ready since" : "Paid"}</TableHeading>
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
                  </td>
                  <td className="px-4 py-4 align-top">{order.email}</td>
                  <td className="px-4 py-4 align-top">
                    {order.items.reduce((total, item) => total + item.quantity, 0)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top font-semibold">
                    {formatMoney(order.totalCents, order.currency)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top">
                    <PickupTimestamp order={order} showReadySince={showReadySince} />
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

function PickupTimestamp({
  order,
  showReadySince,
}: {
  order: PickupOrder;
  showReadySince: boolean;
}) {
  const timestamp = showReadySince ? order.readyForPickupAt : order.createdAt;

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
