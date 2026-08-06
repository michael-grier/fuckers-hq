"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  markOrderAsShipped,
  markOrderPickedUp,
  markOrderReadyForPickup,
} from "@/lib/actions/orders";
import type { OrderFulfillmentTransition } from "@/lib/orders/order-fulfillment";
import {
  getShippingCarrierLabel,
  type ShippingCarrier,
  shippingCarrierValues,
} from "@/lib/orders/shipping-carriers";

type FulfillmentActionInput = {
  orderId: string;
  trackingCarrier?: ShippingCarrier;
  trackingNumber?: string;
};

type TransitionCopy = {
  action: (input: FulfillmentActionInput) => Promise<{ success: boolean; message?: string }>;
  /** Confirmation prompt for the one-click steps; the shipping step confirms via its form. */
  confirm: string | null;
  idle: string;
  pending: string;
};

const transitionCopy: Record<OrderFulfillmentTransition, TransitionCopy> = {
  ship: {
    action: markOrderAsShipped,
    confirm: null,
    idle: "Mark as shipped",
    pending: "Notifying…",
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

const noCarrierValue = "";

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
  const carrierFieldId = useId();
  const trackingFieldId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isShipmentFormOpen, setIsShipmentFormOpen] = useState(false);
  const [carrier, setCarrier] = useState<ShippingCarrier | typeof noCarrierValue>(noCarrierValue);
  const [trackingNumber, setTrackingNumber] = useState("");
  const copy = transitionCopy[transition];

  async function submit(input: FulfillmentActionInput) {
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const result = await copy.action(input);

      if (!result.success) {
        setErrorMessage(result.message ?? "The update could not be completed.");
        return;
      }

      setIsShipmentFormOpen(false);
      router.refresh();
    } catch {
      setErrorMessage("The update could not be completed. Try again shortly.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onConfirmTransition() {
    if (copy.confirm && !window.confirm(copy.confirm)) {
      return;
    }

    await submit({ orderId });
  }

  async function onSubmitShipment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const enteredTrackingNumber = trackingNumber.trim();

    // Mirrors the server rule so the operator sees the problem without a round trip.
    if (carrier !== noCarrierValue && enteredTrackingNumber === "") {
      setErrorMessage("Enter the tracking number, or choose “No tracking number”.");
      return;
    }

    await submit(
      carrier === noCarrierValue
        ? { orderId }
        : { orderId, trackingCarrier: carrier, trackingNumber: enteredTrackingNumber },
    );
  }

  function onChangeCarrier(value: string) {
    const nextCarrier = value as ShippingCarrier | typeof noCarrierValue;
    setCarrier(nextCarrier);

    // A tracking number cannot be submitted without a carrier, so clear it rather than leave a
    // value the operator can no longer see the effect of.
    if (nextCarrier === noCarrierValue) {
      setTrackingNumber("");
    }
  }

  if (transition === "ship" && isShipmentFormOpen) {
    return (
      <form className="space-y-3 text-left" onSubmit={onSubmitShipment}>
        <div className="space-y-1.5">
          <label className="block font-medium text-sm" htmlFor={carrierFieldId}>
            Carrier
          </label>
          <select
            // The form replaces the trigger button, so without this focus would fall to the body.
            // biome-ignore lint/a11y/noAutofocus: restores the focus the opening button gave up.
            autoFocus
            className="flex h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            disabled={isSubmitting}
            id={carrierFieldId}
            onChange={(event) => onChangeCarrier(event.target.value)}
            value={carrier}
          >
            <option value={noCarrierValue}>No tracking number</option>
            {shippingCarrierValues.map((value) => (
              <option key={value} value={value}>
                {getShippingCarrierLabel(value)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block font-medium text-sm" htmlFor={trackingFieldId}>
            Tracking number
          </label>
          <Input
            autoComplete="off"
            disabled={isSubmitting || carrier === noCarrierValue}
            id={trackingFieldId}
            maxLength={64}
            onChange={(event) => setTrackingNumber(event.target.value)}
            value={trackingNumber}
          />
        </div>

        <p className="text-muted-foreground text-xs">
          The customer is emailed either way. With a carrier selected, the email includes a tracking
          link.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button disabled={isSubmitting} size={size} type="submit" variant={variant}>
            {isSubmitting ? copy.pending : "Ship and notify"}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => {
              setErrorMessage(null);
              setIsShipmentFormOpen(false);
            }}
            size={size}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
        </div>

        {errorMessage ? (
          <p className="max-w-xs text-destructive text-sm" role="alert">
            {errorMessage}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <Button
        disabled={isSubmitting}
        onClick={
          transition === "ship"
            ? () => setIsShipmentFormOpen(true)
            : () => void onConfirmTransition()
        }
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
