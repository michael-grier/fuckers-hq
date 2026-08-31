"use client";

import { CircleAlert } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { getCartSubtotalCents, resolveFulfillmentMethod } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import type { CartFulfillmentMethod } from "@/lib/cart/types";
import { type DeliveryArea, LOCAL_DELIVERY_MINIMUM_SUBTOTAL_CENTS } from "@/lib/checkout/delivery";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

type FulfillmentPickerProps = {
  deliveryArea: DeliveryArea | null;
  /** Sidebar variant: a segmented control followed by the selected method's compact details. */
  compact?: boolean;
};

/** Lets the shopper choose shipping or eligible local delivery and accept the manual review rule. */
export function FulfillmentPicker({ deliveryArea, compact = false }: FulfillmentPickerProps) {
  const lines = useCartStore((state) => state.lines);
  const preference = useCartStore((state) => state.fulfillmentMethod);
  const deliveryAddressReviewAcknowledged = useCartStore(
    (state) => state.deliveryAddressReviewAcknowledged,
  );
  const setFulfillmentMethod = useCartStore((state) => state.setFulfillmentMethod);
  const setDeliveryAddressReviewAcknowledged = useCartStore(
    (state) => state.setDeliveryAddressReviewAcknowledged,
  );
  const groupName = useId();

  if (!deliveryArea) {
    return null;
  }

  const subtotal = getCartSubtotalCents(lines);
  const meetsDeliveryMinimum = subtotal >= LOCAL_DELIVERY_MINIMUM_SUBTOTAL_CENTS;
  const selected = resolveFulfillmentMethod(preference, meetsDeliveryMinimum);
  const isDelivery = selected === "delivery";
  const amountUntilDelivery = LOCAL_DELIVERY_MINIMUM_SUBTOTAL_CENTS - subtotal;

  if (compact) {
    return (
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
            disabled={!meetsDeliveryMinimum}
            label="Local delivery"
            name={groupName}
            onSelect={setFulfillmentMethod}
            value="delivery"
          />
        </div>
        {isDelivery ? (
          <DeliveryAcknowledgement
            acknowledged={deliveryAddressReviewAcknowledged}
            compact
            deliveryArea={deliveryArea}
            onAcknowledgedChange={setDeliveryAddressReviewAcknowledged}
          />
        ) : meetsDeliveryMinimum ? (
          <p className="text-muted-foreground text-xs">
            Shipping is calculated at checkout. We do not currently charge sales tax.
          </p>
        ) : (
          <div className="space-y-1 text-muted-foreground text-xs">
            <p>Shipping is calculated at checkout. We do not currently charge sales tax.</p>
            <p>
              Add {formatMoney(amountUntilDelivery)} more for free local delivery within{" "}
              {deliveryArea.areaName}.
            </p>
          </div>
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
          description={`Free on orders of ${formatMoney(LOCAL_DELIVERY_MINIMUM_SUBTOTAL_CENTS)} or more within ${deliveryArea.areaName}.`}
          disabled={!meetsDeliveryMinimum}
          label="Local delivery"
          name={groupName}
          onSelect={setFulfillmentMethod}
          value="delivery"
        >
          {isDelivery ? (
            <DeliveryAcknowledgement
              acknowledged={deliveryAddressReviewAcknowledged}
              deliveryArea={deliveryArea}
              onAcknowledgedChange={setDeliveryAddressReviewAcknowledged}
            />
          ) : null}
        </FulfillmentOption>
      </div>
      {!meetsDeliveryMinimum ? (
        <p className="mt-4 border-t pt-4 text-muted-foreground text-sm">
          Add {formatMoney(amountUntilDelivery)} more to unlock free local delivery.
        </p>
      ) : null}
    </fieldset>
  );
}

type DeliveryAcknowledgementProps = {
  acknowledged: boolean;
  compact?: boolean;
  deliveryArea: DeliveryArea;
  onAcknowledgedChange: (acknowledged: boolean) => void;
};

/** Presents the manual address-review policy and records the required checkout acknowledgement. */
function DeliveryAcknowledgement({
  acknowledged,
  compact = false,
  deliveryArea,
  onAcknowledgedChange,
}: DeliveryAcknowledgementProps) {
  const checkboxId = useId();
  const descriptionId = useId();

  return (
    <div
      className={cn(
        "rounded-md border border-accent/60 bg-accent/10 p-3",
        compact && "mt-1 border-2 border-foreground shadow-[3px_3px_0_var(--color-accent)]",
      )}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-grotesk font-semibold text-sm">Address review required</p>
          <div
            className="space-y-1 text-muted-foreground text-xs leading-relaxed"
            id={descriptionId}
          >
            <p>
              Free local delivery is available on orders of{" "}
              {formatMoney(LOCAL_DELIVERY_MINIMUM_SUBTOTAL_CENTS)} or more within{" "}
              {deliveryArea.areaName}. We review your address after payment.
            </p>
            <p>
              If it is outside the area, we will email you a secure request for the regular shipping
              charge. You can also cancel for a refund.
            </p>
            {deliveryArea.instructions ? <p>{deliveryArea.instructions}</p> : null}
          </div>
        </div>
      </div>
      <label
        className="mt-3 flex cursor-pointer items-start gap-2.5 border-accent/40 border-t pt-3 font-semibold text-xs leading-relaxed"
        htmlFor={checkboxId}
      >
        <Checkbox
          aria-describedby={descriptionId}
          checked={acknowledged}
          className="mt-0.5"
          id={checkboxId}
          onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
        />
        <span>I understand that my address will be reviewed and I may need to pay shipping.</span>
      </label>
    </div>
  );
}

type OptionProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  name: string;
  onSelect: (method: CartFulfillmentMethod) => void;
  value: CartFulfillmentMethod;
};

/** Native radios stay in the markup so arrow-key navigation keeps working. */
function SegmentedOption({ checked, disabled = false, label, name, onSelect, value }: OptionProps) {
  return (
    <label className={cn("cursor-pointer", disabled && "cursor-not-allowed")}>
      <input
        checked={checked}
        className="peer sr-only"
        disabled={disabled}
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
          "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
          !checked && !disabled && "text-muted-foreground hover:bg-muted/30",
        )}
      >
        {label}
      </span>
    </label>
  );
}

function FulfillmentOption({
  checked,
  children,
  description,
  disabled = false,
  label,
  name,
  onSelect,
  value,
}: OptionProps & { children?: ReactNode; description: string }) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 transition",
        "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        checked ? "border-foreground bg-muted/50" : !disabled && "hover:bg-muted/30",
        disabled && "opacity-60",
      )}
    >
      <label className={cn("flex cursor-pointer gap-3", disabled && "cursor-not-allowed")}>
        <input
          checked={checked}
          className="mt-1 size-4 shrink-0 accent-foreground"
          disabled={disabled}
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
      {children}
    </div>
  );
}
