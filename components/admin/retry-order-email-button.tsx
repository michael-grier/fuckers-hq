"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { retryOrderEmail } from "@/lib/actions/orders";
import type { OrderEmailKind } from "@/lib/db/schema";

const emailCopy: Record<OrderEmailKind, { confirm: string; confirmLabel: string; idle: string }> = {
  admin_new_order: {
    confirm: "Retry this admin sale notification?",
    confirmLabel: "Yes, retry",
    idle: "Retry admin notification",
  },
  confirmation: {
    confirm: "Retry this order confirmation email?",
    confirmLabel: "Yes, retry",
    idle: "Retry confirmation email",
  },
  delivery_scheduled: {
    confirm: "Resend the delivery email to this customer?",
    confirmLabel: "Yes, resend",
    idle: "Resend delivery email",
  },
  refund: {
    confirm: "Retry this refund notification email?",
    confirmLabel: "Yes, retry",
    idle: "Retry refund email",
  },
  shipped: {
    confirm: "Resend the shipping notification to this customer?",
    confirmLabel: "Yes, resend",
    idle: "Resend shipping email",
  },
  shipping_payment_request: {
    confirm: "Retry the shipping payment request email?",
    confirmLabel: "Yes, retry",
    idle: "Retry payment request email",
  },
};

export function RetryOrderEmailButton({
  deliveryId,
  orderId,
  kind,
  size,
}: {
  deliveryId?: string;
  orderId: string;
  kind: OrderEmailKind;
  size?: React.ComponentProps<typeof ConfirmButton>["size"];
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = emailCopy[kind];

  async function onRetry() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await retryOrderEmail({ orderId, kind, deliveryId });

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("The retry could not be completed. Try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <ConfirmButton
        confirmLabel={copy.confirmLabel}
        confirmMessage={copy.confirm}
        disabled={isSubmitting}
        onConfirm={() => void onRetry()}
        size={size}
        variant="outline"
      >
        {isSubmitting ? "Retrying…" : copy.idle}
      </ConfirmButton>
      {errorMessage ? (
        <p className="max-w-sm text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
