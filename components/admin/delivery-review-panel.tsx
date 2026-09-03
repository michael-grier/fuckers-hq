import { AlertTriangle, CheckCircle2, Clock3, MapPin } from "lucide-react";
import type { ReactNode } from "react";

import { DeliveryReviewActions } from "@/components/admin/delivery-review-actions";
import { Badge } from "@/components/ui/badge";
import { formatAdminDate, formatConfirmationDeliveryStatus } from "@/lib/admin/format";
import type {
  DeliveryReviewStatus,
  OrderEmailDelivery,
  OrderShippingPaymentRequest,
} from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type DeliveryReviewPanelProps = {
  orderId: string;
  status: DeliveryReviewStatus;
  addressLines: string[];
  paymentRequest: OrderShippingPaymentRequest | null;
  paymentDelivery: OrderEmailDelivery | null;
  approvedAction?: ReactNode;
};

const panelCopy: Record<
  DeliveryReviewStatus,
  { heading: string; description: string; tone: "amber" | "green" | "red" | "sky" }
> = {
  pending: {
    heading: "Review this delivery address",
    description:
      "Confirm that the address is inside the free local delivery area before scheduling a drop-off.",
    tone: "amber",
  },
  approved: {
    heading: "Local delivery approved",
    description: "This order is ready to move through the delivery scheduling queue.",
    tone: "green",
  },
  shipping_payment_pending: {
    heading: "Waiting for shipping payment",
    description:
      "The customer has a secure Stripe link for the regular shipping charge. Do not fulfill until payment is recorded.",
    tone: "sky",
  },
  shipping_payment_received: {
    heading: "Shipping payment received",
    description:
      "This order was converted from local delivery and is ready for the shipping queue.",
    tone: "green",
  },
  shipping_payment_exception: {
    heading: "Shipping payment needs attention",
    description:
      "Reconcile the supplemental payment in Stripe before fulfilling or issuing any refund.",
    tone: "red",
  },
};

const toneStyles = {
  amber: "border-amber-300 bg-amber-50 text-amber-950",
  green: "border-emerald-300 bg-emerald-50 text-emerald-950",
  red: "border-red-300 bg-red-50 text-red-950",
  sky: "border-sky-300 bg-sky-50 text-sky-950",
} as const;

/** Shows the current local-delivery decision and any operator actions still available. */
export function DeliveryReviewPanel({
  orderId,
  status,
  addressLines,
  paymentRequest,
  paymentDelivery,
  approvedAction,
}: DeliveryReviewPanelProps) {
  const copy = panelCopy[status];

  // Approval ends the address-review workflow, so the order summary owns the address afterward.
  if (status === "approved") {
    return (
      <section
        aria-labelledby="delivery-review-heading"
        className={cn(
          "flex flex-wrap items-center justify-between gap-4 rounded-lg border px-5 py-4",
          toneStyles[copy.tone],
        )}
      >
        <div className="flex min-w-0 items-start gap-4">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-semibold" id="delivery-review-heading">
              {copy.heading}
            </h2>
            <p className="mt-1 text-sm opacity-80">{copy.description}</p>
          </div>
        </div>
        {approvedAction}
      </section>
    );
  }

  const mapsUrl =
    addressLines.length > 0
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressLines.join(", "))}`
      : null;
  const Icon =
    status === "pending"
      ? MapPin
      : status === "shipping_payment_exception"
        ? AlertTriangle
        : status === "shipping_payment_pending"
          ? Clock3
          : CheckCircle2;

  return (
    <section
      aria-labelledby="delivery-review-heading"
      className={cn("overflow-hidden rounded-lg border-2", toneStyles[copy.tone])}
    >
      <div className="flex flex-wrap items-start gap-4 border-current/15 border-b px-6 py-5">
        <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-xl" id="delivery-review-heading">
              {copy.heading}
            </h2>
            {status === "pending" || status === "shipping_payment_exception" ? (
              <Badge className="border-current/25 bg-white/60 text-current" variant="outline">
                Needs action
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-6 opacity-80">{copy.description}</p>
        </div>
      </div>

      <div className="grid gap-6 bg-background/80 p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div>
          <h3 className="font-semibold text-sm">Customer address</h3>
          {addressLines.length > 0 ? (
            <address className="mt-2 not-italic text-muted-foreground text-sm leading-6">
              {addressLines.map((line) => (
                <span className="block" key={line}>
                  {line}
                </span>
              ))}
            </address>
          ) : (
            <p className="mt-2 text-destructive text-sm">No address was recorded.</p>
          )}
          {mapsUrl ? (
            <a
              className="mt-3 inline-flex font-semibold text-sm underline underline-offset-4"
              href={mapsUrl}
              rel="noreferrer noopener"
              target="_blank"
            >
              Check address in Google Maps ↗
            </a>
          ) : null}
        </div>

        <div className="space-y-4">
          {paymentRequest ? (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <PaymentDetail
                label="Shipping charge"
                value={`${formatMoney(paymentRequest.amountCents, paymentRequest.currency)}${paymentRequest.taxCents === null ? " + applicable tax" : ""}`}
              />
              <PaymentDetail
                label="Payment link expires"
                value={formatAdminDate(paymentRequest.expiresAt)}
              />
              <PaymentDetail
                label="Payment"
                value={
                  paymentRequest.status === "paid" && paymentRequest.totalCents !== null
                    ? `${formatMoney(paymentRequest.totalCents, paymentRequest.currency)} received`
                    : paymentRequest.status === "pending"
                      ? "Awaiting customer"
                      : paymentRequest.status === "provisioning"
                        ? "Link setup incomplete"
                        : paymentRequest.status === "expired"
                          ? "Link expired"
                          : "Link setup failed"
                }
              />
              <PaymentDetail
                label="Request email"
                value={
                  paymentDelivery
                    ? formatConfirmationDeliveryStatus(paymentDelivery.status)
                    : "Not queued"
                }
              />
            </dl>
          ) : status === "pending" ? (
            <div className="rounded-md border bg-background p-4 text-sm leading-6 text-muted-foreground">
              <p>Review the address using your usual local-area knowledge.</p>
              <p className="mt-2">
                If it qualifies, approve local delivery. If not, create the regular shipping link;
                the stored checkout rate determines the charge.
              </p>
            </div>
          ) : null}

          <DeliveryReviewActions
            checkoutUrl={paymentRequest?.checkoutUrl}
            orderId={orderId}
            status={status}
          />
        </div>
      </div>
    </section>
  );
}

function PaymentDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold text-foreground">{value}</dd>
    </div>
  );
}
