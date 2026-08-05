"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import {
  DisputeStatusBadge,
  OrderInventoryStatusBadge,
  OrderStatusBadge,
  RefundStatusBadge,
} from "@/components/admin/status-badge";
import { formatAdminDate, formatAdminDay } from "@/lib/admin/format";
import { orderNeedsAction } from "@/lib/admin/order-list";
import type { AdminOrderSummary } from "@/lib/admin/queries";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type OrderListRowProps = {
  order: AdminOrderSummary;
  isSelected: boolean;
};

/**
 * Selecting a row writes `peek` to the URL rather than navigating, so the
 * preview is deep-linkable and the browser back button closes it.
 */
export function OrderListRow({ order, isSelected }: OrderListRowProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = new URLSearchParams(searchParams);

  if (isSelected) {
    params.delete("peek");
  } else {
    params.set("peek", order.id);
  }

  const query = params.toString();
  const href = (query ? `${pathname}?${query}` : pathname) as Route;

  // Only rendered when present, so the common row stays two lines.
  const secondaryStates = [
    order.refundStatus !== "none" ? (
      <RefundStatusBadge key="refund" status={order.refundStatus} />
    ) : null,
    order.disputeStatus !== "none" ? (
      <DisputeStatusBadge key="dispute" status={order.disputeStatus} />
    ) : null,
    order.confirmationDeliveryStatus === "failed" ? (
      <span
        className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-[11px] text-amber-800"
        key="email"
      >
        Email failed
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <li>
      <Link
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "block px-5 py-4 outline-none transition focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
          isSelected ? "bg-accent/10 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-muted",
        )}
        href={href}
        prefetch={false}
        scroll={false}
      >
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold text-sm">{order.orderNumber}</span>
          {orderNeedsAction(order) && order.inventoryStatus === "exception" ? (
            <OrderInventoryStatusBadge status={order.inventoryStatus} />
          ) : (
            <OrderStatusBadge status={order.status} />
          )}
          <span className="ml-auto shrink-0 font-semibold text-sm tabular-nums">
            {formatMoney(order.totalCents, order.currency)}
          </span>
        </span>
        <span className="mt-1 flex items-center gap-2 text-muted-foreground text-xs">
          <span className="truncate">{order.email}</span>
          <span aria-hidden="true">·</span>
          <span className="shrink-0">
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
          <time
            className="ml-auto shrink-0"
            dateTime={order.createdAt.toISOString()}
            title={formatAdminDate(order.createdAt)}
          >
            {formatAdminDay(order.createdAt)}
          </time>
        </span>
        {secondaryStates.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">{secondaryStates}</span>
        ) : null}
      </Link>
    </li>
  );
}
