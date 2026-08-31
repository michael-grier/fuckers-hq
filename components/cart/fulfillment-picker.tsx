"use client";

import { useId } from "react";
import { resolveFulfillmentMethod } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import type { CartFulfillmentMethod } from "@/lib/cart/types";
import type { DeliveryArea } from "@/lib/checkout/delivery";
import { cn } from "@/lib/utils";

type FulfillmentPickerProps = {
  deliveryArea: DeliveryArea | null;
  /** Sidebar variant: a segmented control with the details behind a disclosure. */
  compact?: boolean;
};

export function FulfillmentPicker({ deliveryArea, compact = false }: FulfillmentPickerProps) {
  const preference = useCartStore((state) => state.fulfillmentMethod);
  const setFulfillmentMethod = useCartStore((state) => state.setFulfillmentMethod);
  const groupName = useId();
  const selected = resolveFulfillmentMethod(preference, deliveryArea !== null);

  if (!deliveryArea) {
    return null;
  }

  const isDelivery = selected === "delivery";

  if (compact) {
    return (
      // The sheet footer also holds the summary and checkout button, so this stays roughly one
      // control tall and keeps the delivery details collapsed until they are asked for.
      <fieldset className="space-y-2">
        <legend className="font-semibold text-sm">How do you want it?</legend>
        <div className="grid grid-cols-2 gap-2">
          <SegmentedOption
            checked={!isDelivery}
            label="Ship it"
            name={groupName}
            onSelect={setFulfillmentMethod}
            value="shipping"
          />
          <SegmentedOption
            checked={isDelivery}
            label="Local delivery"
            name={groupName}
            onSelect={setFulfillmentMethod}
            value="delivery"
          />
        </div>
        {isDelivery ? (
          <details className="text-muted-foreground text-xs">
            <summary className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Free · {deliveryArea.areaName} only
            </summary>
            <div className="mt-2 space-y-1.5">
              <p>
                We deliver within {deliveryArea.areaName}. Enter your delivery address at checkout,
                and we'll contact you to arrange a time.
              </p>
              {deliveryArea.instructions ? <p>{deliveryArea.instructions}</p> : null}
            </div>
          </details>
        ) : (
          <p className="text-muted-foreground text-xs">
            Shipping is calculated at checkout. We do not currently charge sales tax.
          </p>
        )}
      </fieldset>
    );
  }

  return (
    <fieldset className="rounded-lg border p-5">
      <legend className="px-1 font-grotesk font-semibold text-lg">How do you want it?</legend>
      <div className="mt-3 space-y-3">
        <FulfillmentOption
          checked={!isDelivery}
          description="We ship it to your address. Shipping is calculated at checkout, and sales tax is not currently charged."
          label="Ship it to me"
          name={groupName}
          onSelect={setFulfillmentMethod}
          value="shipping"
        />
        <FulfillmentOption
          checked={isDelivery}
          description={`Free within ${deliveryArea.areaName}. We'll contact you after checkout to arrange a delivery time.`}
          label="Local delivery"
          name={groupName}
          onSelect={setFulfillmentMethod}
          value="delivery"
        />
      </div>
      {isDelivery ? (
        <div className="mt-4 space-y-2 border-t pt-4 text-muted-foreground text-sm">
          <p>
            Available within{" "}
            <span className="font-semibold text-foreground">{deliveryArea.areaName}</span> only.
            Enter your delivery address at checkout.
          </p>
          {deliveryArea.instructions ? <p>{deliveryArea.instructions}</p> : null}
        </div>
      ) : null}
    </fieldset>
  );
}

type OptionProps = {
  checked: boolean;
  label: string;
  name: string;
  onSelect: (method: CartFulfillmentMethod) => void;
  value: CartFulfillmentMethod;
};

/** Native radios stay in the markup (sr-only) so arrow-key navigation keeps working. */
function SegmentedOption({ checked, label, name, onSelect, value }: OptionProps) {
  return (
    <label className="cursor-pointer">
      <input
        checked={checked}
        className="peer sr-only"
        name={name}
        onChange={() => onSelect(value)}
        type="radio"
        value={value}
      />
      <span
        className={cn(
          "flex items-center justify-center rounded-md border px-3 py-2 text-center font-semibold text-sm transition",
          "peer-checked:border-foreground peer-checked:bg-muted",
          "peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
          !checked && "text-muted-foreground hover:bg-muted/30",
        )}
      >
        {label}
      </span>
    </label>
  );
}

function FulfillmentOption({
  checked,
  description,
  label,
  name,
  onSelect,
  value,
}: OptionProps & { description: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-md border p-3 transition",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        checked ? "border-foreground bg-muted/50" : "hover:bg-muted/30",
      )}
    >
      <input
        checked={checked}
        className="mt-1 size-4 shrink-0 accent-foreground"
        name={name}
        onChange={() => onSelect(value)}
        type="radio"
        value={value}
      />
      <span className="space-y-1">
        <span className="block font-semibold text-sm">{label}</span>
        <span className="block text-muted-foreground text-sm">{description}</span>
      </span>
    </label>
  );
}
