"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { Button } from "@/components/ui/button";
import { approveOrderDeliveryAddress, requestOrderShippingCharge } from "@/lib/actions/orders";
import type { DeliveryReviewStatus } from "@/lib/db/schema";

type DeliveryReviewActionsProps = {
  orderId: string;
  status: DeliveryReviewStatus;
  checkoutUrl?: string | null;
};

/** Client controls for the two operator decisions and the generated Stripe link. */
export function DeliveryReviewActions({
  orderId,
  status,
  checkoutUrl,
}: DeliveryReviewActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<"approve" | "shipping" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function approveDelivery() {
    setPendingAction("approve");
    setMessage(null);

    try {
      const result = await approveOrderDeliveryAddress({ orderId });

      if (!result.success) {
        setMessage(result.message);
        return;
      }

      router.refresh();
    } catch {
      setMessage("The address approval could not be saved. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function requestShipping() {
    setPendingAction("shipping");
    setMessage(null);

    try {
      const result = await requestOrderShippingCharge({ orderId });

      if (!result.success) {
        setMessage(result.message);
        return;
      }

      setMessage("Shipping payment link ready. The email outbox will retry if delivery failed.");
      router.refresh();
    } catch {
      setMessage("The shipping payment link could not be created. Try again.");
    } finally {
      setPendingAction(null);
    }
  }

  async function copyCheckoutUrl() {
    if (!checkoutUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(checkoutUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMessage("The link could not be copied. Open it and copy the address from your browser.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "pending" ? (
          <>
            <ConfirmButton
              confirmLabel="Yes, approve"
              confirmMessage="Confirm this address is inside the free delivery area?"
              disabled={pendingAction !== null}
              onConfirm={approveDelivery}
            >
              {pendingAction === "approve" ? "Approving…" : "Approve local delivery"}
            </ConfirmButton>
            <ConfirmButton
              confirmLabel="Create and email link"
              confirmMessage="This emails the regular shipping charge to the customer."
              disabled={pendingAction !== null}
              onConfirm={requestShipping}
              variant="outline"
            >
              {pendingAction === "shipping" ? "Creating…" : "Request shipping payment"}
            </ConfirmButton>
          </>
        ) : null}

        {status === "shipping_payment_pending" && !checkoutUrl ? (
          <Button disabled={pendingAction !== null} onClick={requestShipping} type="button">
            {pendingAction === "shipping" ? "Retrying…" : "Retry payment link"}
          </Button>
        ) : null}

        {checkoutUrl ? (
          <>
            <Button asChild variant="outline">
              <a href={checkoutUrl} rel="noreferrer noopener" target="_blank">
                Open payment link
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
            <Button onClick={copyCheckoutUrl} type="button" variant="ghost">
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </>
        ) : null}
      </div>
      {message ? (
        <p aria-live="polite" className="text-sm text-foreground" role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
