"use client";

import { useId } from "react";
import { resolveFulfillmentMethod } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import type { CartFulfillmentMethod } from "@/lib/cart/types";
import { type PickupLocation, splitPickupAddressLines } from "@/lib/checkout/pickup";
import { cn } from "@/lib/utils";

type FulfillmentPickerProps = {
  pickupLocation: PickupLocation | null;
  /** Sidebar variant: a segmented control with the address behind a disclosure. */
  compact?: boolean;
};

export function FulfillmentPicker({ pickupLocation, compact = false }: FulfillmentPickerProps) {
  const preference = useCartStore((state) => state.fulfillmentMethod);
  const setFulfillmentMethod = useCartStore((state) => state.setFulfillmentMethod);
  const groupName = useId();
  const selected = resolveFulfillmentMethod(preference, pickupLocation !== null);

  if (!pickupLocation) {
    return null;
  }

  const isPickup = selected === "pickup";

  if (compact) {
    return (
      // The sheet footer also holds the summary and checkout button, so this stays roughly one
      // control tall and keeps the pickup address collapsed until it is asked for.
      <fieldset className="space-y-2">
        <legend className="font-semibold text-sm">How do you want it?</legend>
        <div className="grid grid-cols-2 gap-2">
          <SegmentedOption
            checked={!isPickup}
            label="Ship it"
            name={groupName}
            onSelect={setFulfillmentMethod}
            value="shipping"
          />
          <SegmentedOption
            checked={isPickup}
            label="Local pickup"
            name={groupName}
            onSelect={setFulfillmentMethod}
            value="pickup"
          />
        </div>
        {isPickup ? (
          <details className="text-muted-foreground text-xs">
            <summary className="cursor-pointer rounded outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Free · {pickupLocation.name} · {pickupLocation.hours}
            </summary>
            <address className="mt-2 not-italic">
              {splitPickupAddressLines(pickupLocation.address).map((line) => (
                <span className="block" key={line}>
                  {line}
                </span>
              ))}
              {pickupLocation.instructions ? (
                <span className="mt-1.5 block">{pickupLocation.instructions}</span>
              ) : null}
              <span className="mt-1.5 block">We'll email you when your order is ready.</span>
            </address>
          </details>
        ) : (
          <p className="text-muted-foreground text-xs">Rates and tax are calculated at checkout.</p>
        )}
      </fieldset>
    );
  }

  return (
    <fieldset className="rounded-lg border p-5">
      <legend className="px-1 font-grotesk font-semibold text-lg">How do you want it?</legend>
      <div className="mt-3 space-y-3">
        <FulfillmentOption
          checked={!isPickup}
          description="We ship it to your address. Rates and tax are calculated at checkout."
          label="Ship it to me"
          name={groupName}
          onSelect={setFulfillmentMethod}
          value="shipping"
        />
        <FulfillmentOption
          checked={isPickup}
          description={`Free. Collect at ${pickupLocation.name} — ${pickupLocation.hours}. We'll email you when your order is ready.`}
          label="Local pickup"
          name={groupName}
          onSelect={setFulfillmentMethod}
          value="pickup"
        />
      </div>
      {isPickup ? (
        <address className="mt-4 border-t pt-4 not-italic text-muted-foreground text-sm">
          <span className="block font-semibold text-foreground">{pickupLocation.name}</span>
          {splitPickupAddressLines(pickupLocation.address).map((line) => (
            <span className="block" key={line}>
              {line}
            </span>
          ))}
          {pickupLocation.instructions ? (
            <span className="mt-2 block">{pickupLocation.instructions}</span>
          ) : null}
        </address>
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
