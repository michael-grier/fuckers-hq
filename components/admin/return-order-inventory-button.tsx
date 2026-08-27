"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { returnOrderInventoryToStock } from "@/lib/actions/orders";

type ReturnOrderInventoryButtonProps = {
  itemCount: number;
  orderId: string;
  size?: "sm" | "default";
};

/** Confirms and runs the irreversible admin action that makes refunded units sellable again. */
export function ReturnOrderInventoryButton({
  itemCount,
  orderId,
  size = "default",
}: ReturnOrderInventoryButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const units = `${itemCount} ${itemCount === 1 ? "unit" : "units"}`;

  async function onReturnInventory() {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await returnOrderInventoryToStock({ orderId });

      if (!result.success) {
        setErrorMessage(result.message);
        setIsSubmitting(false);
        return;
      }

      // Keep the stale action disabled until the refreshed server state removes this component.
      router.refresh();
    } catch (error) {
      setIsSubmitting(false);
      throw error;
    }
  }

  return (
    <div className="space-y-2">
      <ConfirmButton
        confirmLabel="Yes, return to stock"
        confirmMessage={`Return all ${units} to sellable inventory? This cannot be undone here.`}
        disabled={isSubmitting}
        onConfirm={() => void onReturnInventory()}
        size={size}
        variant="destructive"
      >
        {isSubmitting ? "Returning…" : `Return ${units} to stock`}
      </ConfirmButton>
      {errorMessage ? (
        <p className="max-w-xl text-red-800 text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
