import type { SearchParams } from "nuqs/server";

import { AdminFilterPills } from "@/components/admin/admin-filter-pills";
import { AdminSearchField } from "@/components/admin/admin-search-field";
import { OrderListRow } from "@/components/admin/order-list-row";
import { OrderPeek } from "@/components/admin/order-peek";
import { OrderPeekPane } from "@/components/admin/order-peek-pane";
import { countAdminOrdersByFilter, filterAdminOrders } from "@/lib/admin/order-list";
import { getAdminOrderById, getAdminOrders } from "@/lib/admin/queries";
import { adminOrderSearchParamsCache } from "@/lib/admin/search-params";

type AdminOrdersPageProps = {
  searchParams: Promise<SearchParams>;
};

// Both columns share the grid row height, so the panels stay aligned whichever
// side is taller, and each scrolls internally instead of growing the page as the
// order list gets long. The 16rem offset covers the admin chrome above the split
// (page padding, heading, and filter row).
const splitLayoutClassName =
  "grid gap-4 lg:h-[calc(100vh-16rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(360px,460px)_1fr]";

export default async function AdminOrdersPage({ searchParams }: AdminOrdersPageProps) {
  const filters = await adminOrderSearchParamsCache.parse(searchParams);
  const orders = await getAdminOrders();
  const counts = countAdminOrdersByFilter(orders);
  const visibleOrders = filterAdminOrders(orders, filters);
  // Only preview an order that survives the active filters, so the pane can
  // never describe a row the operator cannot see.
  const peekId = visibleOrders.some((order) => order.id === filters.peek) ? filters.peek : null;
  const peekOrder = peekId ? await getAdminOrderById(peekId) : null;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Orders</h1>
        <p className="text-muted-foreground">
          Select an order to preview and act on it without leaving the list.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminFilterPills
          defaultValue="all"
          label="Filter orders by workflow state"
          name="filter"
          options={[
            { value: "all", label: "All", count: counts.all },
            {
              value: "needs-action",
              label: "Needs action",
              count: counts["needs-action"],
              urgent: counts["needs-action"] > 0,
            },
            { value: "to-ship", label: "To ship", count: counts["to-ship"] },
            { value: "shipped", label: "Shipped", count: counts.shipped },
            { value: "refunded", label: "Refunded", count: counts.refunded },
          ]}
        />
        <AdminSearchField
          id="admin-order-search"
          label="Search orders"
          placeholder="Order number, email…"
        />
      </div>

      {orders.length === 0 ? (
        <EmptyOrders />
      ) : visibleOrders.length === 0 ? (
        <NoMatches />
      ) : (
        <div className={splitLayoutClassName}>
          <div className="overflow-y-auto rounded-lg border bg-background">
            <ul className="divide-y">
              {visibleOrders.map((order) => (
                <OrderListRow isSelected={order.id === peekId} key={order.id} order={order} />
              ))}
            </ul>
          </div>

          {peekOrder ? (
            <OrderPeekPane title={peekOrder.orderNumber}>
              <OrderPeek order={peekOrder} />
            </OrderPeekPane>
          ) : (
            <aside className="hidden items-center justify-center rounded-lg border border-dashed bg-background p-8 text-center lg:flex">
              <p className="text-muted-foreground text-sm">
                Select an order to preview its items, totals, and actions.
              </p>
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function NoMatches() {
  return (
    <section className="rounded-lg border border-dashed bg-background px-6 py-12 text-center">
      <h2 className="font-bold text-xl">No orders match these filters</h2>
      <p className="mt-2 text-muted-foreground">Try a different workflow state or search term.</p>
    </section>
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
