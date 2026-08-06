"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  markOrderAsShipped,
  markOrderPickedUp,
  markOrderReadyForPickup,
} from "@/lib/actions/orders";
import type { OrderFulfillmentTransition } from "@/lib/orders/order-fulfillment";

type TransitionCopy = {
  action: (input: { orderId: string }) => Promise<{ success: boolean; message?: string }>;
  confirm: string;
  idle: string;
  pending: string;
};

const transitionCopy: Record<OrderFulfillmentTransition, TransitionCopy> = {
  ship: {
    action: markOrderAsShipped,
    confirm: "Mark this order as shipped?",
    idle: "Mark as shipped",
    pending: "Updating…",
  },
  ready_for_pickup: {
    action: markOrderReadyForPickup,
    confirm: "Mark this order ready for pickup? This emails the customer to come collect it.",
    idle: "Mark ready for pickup",
    pending: "Notifying…",
  },
  picked_up: {
    action: markOrderPickedUp,
    confirm: "Mark this order as picked up by the customer?",
    idle: "Mark as picked up",
    pending: "Updating…",
  },
};

type FulfillmentActionButtonProps = {
  orderId: string;
  transition: OrderFulfillmentTransition;
  size?: "sm" | "default";
  variant?: "default" | "outline";
};

export function FulfillmentActionButton({
  orderId,
  transition,
  size = "default",
  variant = "default",
}: FulfillmentActionButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const copy = transitionCopy[transition];

  async function onSubmitTransition() {
    if (!window.confirm(copy.confirm)) {
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await copy.action({ orderId });

      if (!result.success) {
        setErrorMessage(result.message ?? "The update could not be completed.");
        return;
      }

      router.refresh();
    } catch {
      setErrorMessage("The update could not be completed. Try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={isSubmitting}
        onClick={onSubmitTransition}
        size={size}
        type="button"
        variant={variant}
      >
        {isSubmitting ? copy.pending : copy.idle}
      </Button>
      {errorMessage ? (
        <p className="max-w-xs text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
