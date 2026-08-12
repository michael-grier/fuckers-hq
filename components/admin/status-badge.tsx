import { Badge } from "@/components/ui/badge";
import type { Order, Product } from "@/lib/db/schema";

const productStatusStyles: Record<Product["status"], string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-800",
  draft: "border-border bg-muted text-muted-foreground",
  archived: "border-border bg-background text-muted-foreground",
};

const orderStatusStyles: Record<Order["status"], string> = {
  pending: "border-border bg-background text-muted-foreground",
  paid: "border-amber-200 bg-amber-50 text-amber-900",
  delivery_scheduled: "border-sky-200 bg-sky-50 text-sky-900",
  fulfilled: "border-emerald-200 bg-emerald-50 text-emerald-800",
  cancelled: "border-red-200 bg-red-50 text-red-800",
  refunded: "border-border bg-muted text-muted-foreground",
};

// `fulfilled` reads differently per method, so its label is resolved alongside the method below.
const orderStatusLabels: Record<Order["status"], string> = {
  pending: "Pending",
  paid: "Paid",
  delivery_scheduled: "Delivery scheduled",
  fulfilled: "Shipped",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const fulfillmentMethodLabels: Record<Order["fulfillmentMethod"], string> = {
  shipping: "Shipping",
  delivery: "Local delivery",
};

const orderInventoryStatusStyles: Record<Order["inventoryStatus"], string> = {
  allocated: "border-emerald-200 bg-emerald-50 text-emerald-800",
  exception: "border-red-200 bg-red-50 text-red-800",
};

const orderInventoryStatusLabels: Record<Order["inventoryStatus"], string> = {
  allocated: "Allocated",
  exception: "Inventory exception",
};

const refundStatusStyles: Record<Order["refundStatus"], string> = {
  none: "border-border bg-background text-muted-foreground",
  partial: "border-orange-200 bg-orange-50 text-orange-900",
  full: "border-border bg-muted text-muted-foreground",
};

const refundStatusLabels: Record<Order["refundStatus"], string> = {
  none: "Not refunded",
  partial: "Partially refunded",
  full: "Fully refunded",
};

const disputeStatusStyles: Record<Order["disputeStatus"], string> = {
  none: "border-border bg-background text-muted-foreground",
  open: "border-red-200 bg-red-50 text-red-800",
  won: "border-emerald-200 bg-emerald-50 text-emerald-800",
  lost: "border-red-200 bg-red-50 text-red-800",
  prevented: "border-red-200 bg-red-50 text-red-800",
};

const disputeStatusLabels: Record<Order["disputeStatus"], string> = {
  none: "No dispute",
  open: "Dispute open",
  won: "Dispute won",
  lost: "Dispute lost",
  prevented: "Dispute prevented",
};

function formatStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ProductStatusBadge({ status }: { status: Product["status"] }) {
  return (
    <Badge className={productStatusStyles[status]} variant="outline">
      {formatStatus(status)}
    </Badge>
  );
}

export function OrderStatusBadge({
  status,
  fulfillmentMethod,
}: {
  status: Order["status"];
  fulfillmentMethod?: Order["fulfillmentMethod"];
}) {
  // `fulfilled` means shipped or delivered depending on the method, so without one the label
  // stays neutral rather than asserting a shipment that may never have happened.
  const label =
    status === "fulfilled"
      ? fulfillmentMethod === "delivery"
        ? "Delivered"
        : fulfillmentMethod === "shipping"
          ? "Shipped"
          : "Completed"
      : orderStatusLabels[status];

  return (
    <Badge className={orderStatusStyles[status]} variant="outline">
      {label}
    </Badge>
  );
}

export function FulfillmentMethodBadge({ method }: { method: Order["fulfillmentMethod"] }) {
  return (
    <Badge
      className={
        method === "delivery"
          ? "border-sky-200 bg-sky-50 text-sky-900"
          : "border-border bg-background text-muted-foreground"
      }
      variant="outline"
    >
      {fulfillmentMethodLabels[method]}
    </Badge>
  );
}

export function OrderInventoryStatusBadge({ status }: { status: Order["inventoryStatus"] }) {
  return (
    <Badge className={orderInventoryStatusStyles[status]} variant="outline">
      {orderInventoryStatusLabels[status]}
    </Badge>
  );
}

export function RefundStatusBadge({ status }: { status: Order["refundStatus"] }) {
  return (
    <Badge className={refundStatusStyles[status]} variant="outline">
      {refundStatusLabels[status]}
    </Badge>
  );
}

export function DisputeStatusBadge({ status }: { status: Order["disputeStatus"] }) {
  return (
    <Badge className={disputeStatusStyles[status]} variant="outline">
      {disputeStatusLabels[status]}
    </Badge>
  );
}
