import { AlertTriangle, ArrowUpRight, MailWarning } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import {
  DisputeStatusBadge,
  OrderInventoryStatusBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from "@/components/admin/status-badge";
import { Button } from "@/components/ui/button";
import {
  formatAdminDate,
  formatOrderEmailFailureImpact,
  formatOrderEmailKind,
} from "@/lib/admin/format";
import {
  getAdminAttentionItems,
  getAdminDashboardSummary,
  getAdminRecentOrders,
} from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export default async function AdminPage() {
  const [summary, attention, recentOrders] = await Promise.all([
    getAdminDashboardSummary(),
    getAdminAttentionItems(),
    getAdminRecentOrders(),
  ]);
  const attentionCount =
    attention.inventoryExceptionOrders.length + attention.failedEmailDeliveries.length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            {attentionCount === 0
              ? "All clear — nothing needs your attention."
              : `${attentionCount} ${attentionCount === 1 ? "item needs" : "items need"} your attention.`}
          </p>
        </div>
        <Button
          asChild
          className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
        >
          <Link href={"/admin/products/new" as Route} prefetch={false}>
            New product
          </Link>
        </Button>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          href={"/admin/products" as Route}
          label="Products"
          value={summary.productCount}
        />
        <SummaryCard href={"/admin/orders" as Route} label="Orders" value={summary.orderCount} />
        <SummaryCard
          href={"/admin/orders" as Route}
          label="Awaiting shipment"
          value={summary.awaitingFulfillmentCount}
        />
        <SummaryCard
          href={"/admin/deliveries" as Route}
          label="Deliveries to schedule"
          value={summary.deliveriesToScheduleCount}
        />
        <SummaryCard
          href={"/admin/deliveries" as Route}
          label="Awaiting delivery"
          value={summary.awaitingDeliveryCount}
        />
        <SummaryCard
          highlight={summary.inventoryExceptionCount > 0}
          href={"/admin/orders" as Route}
          label="Inventory exceptions"
          value={summary.inventoryExceptionCount}
        />
      </dl>

      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section
          aria-labelledby="recent-orders-heading"
          className="overflow-hidden rounded-lg border bg-background"
        >
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <h2 className="font-bold text-lg" id="recent-orders-heading">
              Recent orders
            </h2>
            <Link
              className="font-semibold text-muted-foreground text-sm underline-offset-4 transition hover:text-foreground hover:underline hover:decoration-2 hover:decoration-accent"
              href={"/admin/orders" as Route}
              prefetch={false}
            >
              View all
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="px-5 py-8 text-muted-foreground text-sm">
              Orders appear here after the Stripe webhook persists them.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Most recent orders</caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    <TableHeading>Order</TableHeading>
                    <TableHeading>Status</TableHeading>
                    <TableHeading>Customer</TableHeading>
                    <TableHeading>Total</TableHeading>
                    <TableHeading>Placed</TableHeading>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentOrders.map((order) => (
                    <tr key={order.id}>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top font-semibold">
                        <Link
                          className="underline-offset-4 hover:underline hover:decoration-2 hover:decoration-accent"
                          href={`/admin/orders/${order.id}` as Route}
                          prefetch={false}
                        >
                          {order.orderNumber}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 align-top">
                        <div className="flex flex-wrap items-start gap-1.5">
                          <OrderStatusBadge
                            fulfillmentMethod={order.fulfillmentMethod}
                            status={order.status}
                          />
                          {order.inventoryStatus === "exception" ? (
                            <OrderInventoryStatusBadge status={order.inventoryStatus} />
                          ) : null}
                          {order.refundStatus !== "none" ? (
                            <RefundStatusBadge status={order.refundStatus} />
                          ) : null}
                          {order.disputeStatus !== "none" ? (
                            <DisputeStatusBadge status={order.disputeStatus} />
                          ) : null}
                        </div>
                      </td>
                      <td className="max-w-48 truncate px-5 py-3.5 align-top">{order.email}</td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top font-semibold">
                        {formatMoney(order.totalCents, order.currency)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 align-top text-muted-foreground">
                        <time dateTime={order.createdAt.toISOString()}>
                          {formatAdminDate(order.createdAt)}
                        </time>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section
          aria-labelledby="needs-attention-heading"
          className="rounded-lg border bg-background"
        >
          <div className="border-b px-5 py-4">
            <h2 className="font-bold text-lg" id="needs-attention-heading">
              Needs attention
            </h2>
          </div>
          {attentionCount === 0 ? (
            <p className="px-5 py-8 text-muted-foreground text-sm">
              All clear. Inventory exceptions and failed order emails show up here.
            </p>
          ) : (
            <ul className="divide-y">
              {attention.inventoryExceptionOrders.map((order) => (
                <AttentionItem
                  action="Resolve"
                  description={`Paid ${formatMoney(order.totalCents, order.currency)} · ${order.email}. Inventory allocation failed — do not fulfill.`}
                  href={`/admin/orders/${order.id}` as Route}
                  icon={<AlertTriangle aria-hidden="true" className="size-4 text-destructive" />}
                  key={order.id}
                  title={`${order.orderNumber} — inventory exception`}
                />
              ))}
              {attention.failedEmailDeliveries.map((delivery) => (
                <AttentionItem
                  action="Retry email"
                  description={`Gave up after ${delivery.attemptCount} ${delivery.attemptCount === 1 ? "attempt" : "attempts"}${delivery.lastErrorCode ? ` (${delivery.lastErrorCode})` : ""}. ${formatOrderEmailFailureImpact(delivery.kind)}`}
                  href={`/admin/orders/${delivery.order.id}` as Route}
                  icon={<MailWarning aria-hidden="true" className="size-4 text-amber-600" />}
                  key={delivery.id}
                  title={`${delivery.order.orderNumber} — ${formatOrderEmailKind(delivery.kind)} email failed`}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TableHeading({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-5 py-3 font-semibold" scope="col">
      {children}
    </th>
  );
}

function SummaryCard({
  label,
  value,
  href,
  highlight = false,
}: {
  label: string;
  value: number;
  href: Route;
  highlight?: boolean;
}) {
  return (
    <div className="relative rounded-lg border bg-background p-5 transition hover:border-accent">
      <dt className="font-medium text-muted-foreground text-sm">
        {/* The stretched link makes the whole card clickable without nesting interactive elements. */}
        <Link
          className="outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          href={href}
          prefetch={false}
        >
          {label}
        </Link>
        <ArrowUpRight
          aria-hidden="true"
          className="absolute top-5 right-5 size-4 text-muted-foreground/50"
        />
      </dt>
      <dd
        className={cn("mt-2 font-grotesk font-semibold text-3xl", highlight && "text-destructive")}
      >
        {value}
      </dd>
    </div>
  );
}

function AttentionItem({
  action,
  description,
  href,
  icon,
  title,
}: {
  action: string;
  description: string;
  href: Route;
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0 space-y-2">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-muted-foreground text-xs">{description}</p>
        <Button asChild size="sm" variant="outline">
          <Link href={href} prefetch={false}>
            {action}
          </Link>
        </Button>
      </div>
    </li>
  );
}
