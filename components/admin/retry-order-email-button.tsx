"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { retryOrderEmail } from "@/lib/actions/orders";
import type { OrderEmailKind } from "@/lib/db/schema";

const emailCopy: Record<OrderEmailKind, { confirm: string; idle: string }> = {
  confirmation: {
    confirm: "Retry this order confirmation email?",
    idle: "Retry confirmation email",
  },
  pickup_ready: {
    confirm: "Resend the pickup-ready email to this customer?",
    idle: "Resend pickup email",
  },
};

export function RetryOrderEmailButton({
  orderId,
  kind,
}: {
  orderId: string;
  kind: OrderEmailKind;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = emailCopy[kind];

  async function onRetry() {
    if (!window.confirm(copy.confirm)) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await retryOrderEmail({ orderId, kind });

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
      <Button disabled={isSubmitting} onClick={onRetry} type="button" variant="outline">
        {isSubmitting ? "Retrying…" : copy.idle}
      </Button>
      {errorMessage ? (
        <p className="max-w-sm text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
