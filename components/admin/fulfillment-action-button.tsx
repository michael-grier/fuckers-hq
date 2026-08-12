"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  markOrderAsShipped,
  markOrderDelivered,
  scheduleOrderDelivery,
} from "@/lib/actions/orders";
import type { OrderFulfillmentTransition } from "@/lib/orders/order-fulfillment";
import {
  carrierHasTrackingLink,
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
  schedule_delivery: {
    action: scheduleOrderDelivery,
    confirm:
      "Schedule this order for delivery? This emails the customer that you'll be in touch to arrange the drop-off.",
    idle: "Schedule delivery",
    pending: "Notifying…",
  },
  delivered: {
    action: markOrderDelivered,
    confirm: "Mark this order as delivered to the customer?",
    idle: "Mark as delivered",
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Set only when the form is dismissed without shipping, so focus is restored to the control the
  // operator opened it from rather than falling to the document body.
  const shouldRestoreTriggerFocus = useRef(false);
  const copy = transitionCopy[transition];

  useEffect(() => {
    if (!isShipmentFormOpen && shouldRestoreTriggerFocus.current) {
      shouldRestoreTriggerFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isShipmentFormOpen]);

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

  function closeShipmentForm() {
    setErrorMessage(null);
    shouldRestoreTriggerFocus.current = true;
    setIsShipmentFormOpen(false);
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

  // Stated per carrier: "Other carrier" has no tracking page, so promising a link there would be a
  // lie the customer discovers when the email arrives with a bare number.
  const shipmentHint =
    carrier === noCarrierValue
      ? "The customer is emailed either way. Without a carrier, the email just says the order shipped."
      : carrierHasTrackingLink(carrier)
        ? "The email includes this tracking number and a link to the carrier's tracking page."
        : "This carrier has no tracking page, so the email shows the number as plain text.";

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

        <p className="text-muted-foreground text-xs">{shipmentHint}</p>

        <div className="flex flex-wrap gap-2">
          <Button disabled={isSubmitting} size={size} type="submit" variant={variant}>
            {isSubmitting ? copy.pending : "Ship and notify"}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={closeShipmentForm}
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
        ref={triggerRef}
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
