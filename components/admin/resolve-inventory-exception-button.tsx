"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { retryOrderInventoryAllocation } from "@/lib/actions/orders";

export function ResolveInventoryExceptionButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function onRetryAllocation() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await retryOrderInventoryAllocation({ orderId });

      if (!result.success) {
        setErrorMessage(result.message);
        return;
      }

      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <ConfirmButton
        confirmLabel="Yes, retry"
        confirmMessage="Retry inventory allocation using current stock?"
        disabled={isSubmitting}
        onConfirm={() => void onRetryAllocation()}
        variant="outline"
      >
        {isSubmitting ? "Retrying…" : "Retry inventory allocation"}
      </ConfirmButton>
      {errorMessage ? (
        <p className="max-w-xl text-red-800 text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
