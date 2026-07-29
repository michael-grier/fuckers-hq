import type { Route } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getAdminDashboardSummary } from "@/lib/admin/queries";

export default async function AdminPage() {
  const summary = await getAdminDashboardSummary();

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Admin dashboard</h1>
        <p className="text-muted-foreground text-lg">
          Review catalog and paid-order data before enabling admin mutations.
        </p>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Products" value={summary.productCount} />
        <SummaryCard label="Orders" value={summary.orderCount} />
        <SummaryCard label="Awaiting fulfillment" value={summary.awaitingFulfillmentCount} />
        <SummaryCard label="Inventory exceptions" value={summary.inventoryExceptionCount} />
      </dl>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={"/admin/products" as Route} prefetch={false}>
            Review products
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={"/admin/orders" as Route} prefetch={false}>
            Review orders
          </Link>
        </Button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border bg-background p-5">
      <dt className="font-medium text-muted-foreground text-sm">{label}</dt>
      <dd className="mt-2 font-grotesk font-semibold text-3xl">{value}</dd>
    </div>
  );
}
