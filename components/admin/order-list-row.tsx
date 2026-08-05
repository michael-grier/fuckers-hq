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
import { formatAdminDate } from "@/lib/admin/format";
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

  return (
    <li>
      <Link
        aria-current={isSelected ? "true" : undefined}
        className={cn(
          "block px-4 py-3 outline-none transition focus-visible:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset",
          isSelected ? "bg-accent/10 shadow-[inset_3px_0_0_var(--accent)]" : "hover:bg-muted",
        )}
        href={href}
        prefetch={false}
        scroll={false}
      >
        <span className="flex items-center gap-2">
          <span className="font-semibold text-sm">{order.orderNumber}</span>
          {orderNeedsAction(order) && order.inventoryStatus === "exception" ? (
            <OrderInventoryStatusBadge status={order.inventoryStatus} />
          ) : (
            <OrderStatusBadge status={order.status} />
          )}
          <time
            className="ml-auto shrink-0 text-muted-foreground text-xs"
            dateTime={order.createdAt.toISOString()}
          >
            {formatAdminDate(order.createdAt)}
          </time>
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-xs">
          <span className="truncate">{order.email}</span>
          <span aria-hidden="true">·</span>
          <span>
            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-semibold text-foreground tabular-nums">
            {formatMoney(order.totalCents, order.currency)}
          </span>
          {order.refundStatus !== "none" ? <RefundStatusBadge status={order.refundStatus} /> : null}
          {order.disputeStatus !== "none" ? (
            <DisputeStatusBadge status={order.disputeStatus} />
          ) : null}
          {order.confirmationDeliveryStatus === "failed" ? (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-semibold text-[11px] text-amber-800">
              Email failed
            </span>
          ) : null}
        </span>
      </Link>
    </li>
  );
}
