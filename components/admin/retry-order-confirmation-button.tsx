"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { retryOrderConfirmation } from "@/lib/actions/orders";

export function RetryOrderConfirmationButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onRetry() {
    if (!window.confirm("Retry this order confirmation email?")) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await retryOrderConfirmation({ orderId });

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
        {isSubmitting ? "Retrying…" : "Retry confirmation email"}
      </Button>
      {errorMessage ? (
        <p className="max-w-sm text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
