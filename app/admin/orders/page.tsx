import type { Route } from "next";
import Link from "next/link";

import {
  DisputeStatusBadge,
  OrderInventoryStatusBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import { formatAdminDate } from "@/lib/admin/format";
import { getAdminOrders } from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";

export default async function AdminOrdersPage() {
  const orders = await getAdminOrders();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Orders</h1>
        <p className="text-muted-foreground">Paid orders from verified Stripe webhook events.</p>
      </div>

      {orders.length === 0 ? (
        <EmptyOrders />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-background">
          <table className="w-full min-w-4xl text-left text-sm">
            <caption className="sr-only">Orders sorted newest first</caption>
            <thead className="border-b bg-muted/50">
              <tr>
                <TableHeading>Order</TableHeading>
                <TableHeading>Status</TableHeading>
                <TableHeading>Inventory</TableHeading>
                <TableHeading>Customer</TableHeading>
                <TableHeading>Items</TableHeading>
                <TableHeading>Total</TableHeading>
                <TableHeading>Created</TableHeading>
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
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex flex-col items-start gap-1.5">
                      <OrderStatusBadge status={order.status} />
                      {order.refundStatus !== "none" ? (
                        <RefundStatusBadge status={order.refundStatus} />
                      ) : null}
                      {order.disputeStatus !== "none" ? (
                        <DisputeStatusBadge status={order.disputeStatus} />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top">
                    <OrderInventoryStatusBadge status={order.inventoryStatus} />
                  </td>
                  <td className="px-4 py-4 align-top">{order.email}</td>
                  <td className="px-4 py-4 align-top">
                    {order.items.reduce((total, item) => total + item.quantity, 0)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top font-semibold">
                    <span className="block">{formatMoney(order.totalCents, order.currency)}</span>
                    {order.refundedCents > 0 ? (
                      <span className="block font-normal text-muted-foreground text-xs">
                        {formatMoney(order.refundedCents, order.currency)} refunded
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 align-top">
                    <time dateTime={order.createdAt.toISOString()}>
                      {formatAdminDate(order.createdAt)}
                    </time>
                  </td>
                  <td className="px-4 py-4 text-right align-top">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/orders/${order.id}` as Route} prefetch={false}>
                        Details
                      </Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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

function EmptyOrders() {
  return (
    <section className="rounded-lg border border-dashed bg-background px-6 py-12 text-center">
      <h2 className="font-bold text-xl">No paid orders yet</h2>
      <p className="mt-2 text-muted-foreground">
        Orders appear here after the Stripe webhook persists them.
      </p>
    </section>
  );
}
