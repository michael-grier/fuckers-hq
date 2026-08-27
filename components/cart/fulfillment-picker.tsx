"use client";

import { CheckCircle2, ChevronDown, LoaderCircle, MapPin } from "lucide-react";
import { type FormEvent, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getCartSubtotalCents,
  getCheckoutCartFingerprint,
  resolveFulfillmentMethod,
} from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import type { CartDisplayLine, CartFulfillmentMethod } from "@/lib/cart/types";
import { type DeliveryArea, LOCAL_DELIVERY_MINIMUM_CENTS } from "@/lib/checkout/delivery";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { deliveryEligibilityResponseSchema } from "@/lib/validators/delivery";

type FulfillmentPickerProps = {
  deliveryArea: DeliveryArea | null;
  /** Sidebar variant: keeps the address form behind a one-row disclosure. */
  compact?: boolean;
  lines: CartDisplayLine[];
};

export function FulfillmentPicker({
  deliveryArea,
  lines,
  compact = false,
}: FulfillmentPickerProps) {
  const preference = useCartStore((state) => state.fulfillmentMethod);
  const eligibility = useCartStore((state) => state.deliveryEligibility);
  const setFulfillmentMethod = useCartStore((state) => state.setFulfillmentMethod);
  const setDeliveryEligibility = useCartStore((state) => state.setDeliveryEligibility);
  const clearDeliveryEligibility = useCartStore((state) => state.clearDeliveryEligibility);
  const [message, setMessage] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [line1, setLine1] = useState("");
  const [unit, setUnit] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const groupName = useId();
  const streetAddressId = useId();
  const unitId = useId();
  const postalCodeId = useId();
  const selected = resolveFulfillmentMethod(preference, eligibility !== null);
  const subtotalCents = getCartSubtotalCents(lines);
  const amountRemainingCents = Math.max(LOCAL_DELIVERY_MINIMUM_CENTS - subtotalCents, 0);

  if (!deliveryArea) {
    return null;
  }

  async function handleEligibilityCheck(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsChecking(true);
    const submittedCartFingerprint = getCheckoutCartFingerprint(lines, "shipping");

    try {
      const response = await fetch("/api/delivery/eligibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map(({ variantId, quantity }) => ({ variantId, quantity })),
          address: {
            line1,
            unit,
            postalCode,
          },
        }),
      });
      const responseBody: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const error =
          typeof responseBody === "object" &&
          responseBody !== null &&
          "error" in responseBody &&
          typeof responseBody.error === "string"
            ? responseBody.error
            : "We couldn't check that address. Try again.";
        throw new Error(error);
      }

      const result = deliveryEligibilityResponseSchema.safeParse(responseBody);

      if (!result.success) {
        throw new Error("The delivery check returned an invalid response. Try again.");
      }

      if (result.data.status === "eligible") {
        const currentCartFingerprint = getCheckoutCartFingerprint(
          useCartStore.getState().lines,
          "shipping",
        );

        if (currentCartFingerprint !== submittedCartFingerprint) {
          return;
        }

        setMessage(result.data.message);
        setDeliveryEligibility({
          token: result.data.token,
          address: result.data.address,
          reviewRequired: result.data.reviewRequired,
        });

        if (disclosureRef.current) {
          disclosureRef.current.open = false;
        }
      } else {
        setMessage(result.data.message);
        clearDeliveryEligibility();
      }
    } catch (error) {
      clearDeliveryEligibility();
      setMessage(
        error instanceof Error ? error.message : "We couldn't check that address. Try again.",
      );
    } finally {
      setIsChecking(false);
    }
  }

  function changeAddress() {
    clearDeliveryEligibility();
    setMessage(null);
    requestAnimationFrame(() => {
      if (disclosureRef.current) {
        disclosureRef.current.open = true;
      }
    });
  }

  const isDelivery = selected === "delivery";

  return (
    <fieldset className={cn(!compact && "rounded-lg border p-5")}>
      <legend className={cn("font-grotesk font-semibold", compact ? "text-sm" : "px-1 text-lg")}>
        How do you want it?
      </legend>
      <div className={cn(compact ? "mt-2 space-y-2" : "mt-3 space-y-3")}>
        {compact ? (
          <div className={cn("grid gap-2", eligibility && "grid-cols-2")}>
            <SegmentedOption
              checked={!isDelivery}
              label="Ship it"
              name={groupName}
              onSelect={setFulfillmentMethod}
              value="shipping"
            />
            {eligibility ? (
              <SegmentedOption
                checked={isDelivery}
                label="Local delivery"
                name={groupName}
                onSelect={setFulfillmentMethod}
                value="delivery"
              />
            ) : null}
          </div>
        ) : (
          <>
            <FulfillmentOption
              checked={!isDelivery}
              description="Rates and tax are calculated at checkout."
              label="Ship it to me"
              name={groupName}
              onSelect={setFulfillmentMethod}
              value="shipping"
            />
            {eligibility ? (
              <FulfillmentOption
                checked={isDelivery}
                description={`Free within ${deliveryArea.areaName}. We'll contact you to arrange a time.`}
                label="Local delivery"
                name={groupName}
                onSelect={setFulfillmentMethod}
                value="delivery"
              />
            ) : null}
          </>
        )}

        {eligibility ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-700/30 bg-emerald-500/10 p-2.5 text-xs">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-700" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">Free local delivery available</p>
              <p className="truncate text-muted-foreground">
                {formatDeliveryAddress(eligibility.address)} ·{" "}
                {formatPostalCode(eligibility.address.postalCode)}
              </p>
              {eligibility.reviewRequired ? (
                <p className="mt-1 text-muted-foreground">
                  We'll confirm the address before scheduling.
                </p>
              ) : null}
            </div>
            <button
              className="shrink-0 rounded font-semibold underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={changeAddress}
              type="button"
            >
              Change
            </button>
          </div>
        ) : (
          <details className="group rounded-md border" ref={disclosureRef}>
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2.5 font-semibold text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
              <MapPin aria-hidden="true" className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">Check free local delivery</span>
              <span className="text-muted-foreground text-xs">$30 minimum</span>
              <ChevronDown
                aria-hidden="true"
                className="size-4 shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="border-t px-3 py-3">
              {amountRemainingCents > 0 ? (
                <p className="text-muted-foreground text-sm">
                  Add {formatMoney(amountRemainingCents)} more to unlock free local delivery in{" "}
                  {deliveryArea.areaName}.
                </p>
              ) : (
                <form className="space-y-3" onSubmit={handleEligibilityCheck}>
                  <p className="text-muted-foreground text-xs">
                    Use the street address only—don't include the city or province. We'll check
                    whether it's inside {deliveryArea.areaName}.
                  </p>
                  <div className="space-y-1">
                    <label className="font-semibold text-xs" htmlFor={streetAddressId}>
                      Street address
                    </label>
                    <Input
                      autoComplete="shipping address-line1"
                      id={streetAddressId}
                      maxLength={120}
                      name="line1"
                      placeholder="262075 Rocky View Point"
                      required
                      onChange={(event) => setLine1(event.currentTarget.value)}
                      value={line1}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3">
                    <div className="space-y-1">
                      <label className="font-semibold text-xs" htmlFor={unitId}>
                        Unit <span className="font-normal text-muted-foreground">(optional)</span>
                      </label>
                      <Input
                        autoComplete="shipping address-line2"
                        id={unitId}
                        maxLength={32}
                        name="unit"
                        placeholder="103"
                        onChange={(event) => setUnit(event.currentTarget.value)}
                        value={unit}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="font-semibold text-xs" htmlFor={postalCodeId}>
                        Postal code
                      </label>
                      <Input
                        autoCapitalize="characters"
                        autoComplete="shipping postal-code"
                        id={postalCodeId}
                        inputMode="text"
                        maxLength={7}
                        name="postalCode"
                        placeholder="T4A 0X2"
                        required
                        onChange={(event) => setPostalCode(event.currentTarget.value)}
                        value={postalCode}
                      />
                    </div>
                  </div>
                  <Button className="w-full" disabled={isChecking} size="sm" type="submit">
                    {isChecking ? (
                      <>
                        <LoaderCircle aria-hidden="true" className="animate-spin" />
                        Checking…
                      </>
                    ) : (
                      "Check address"
                    )}
                  </Button>
                  {deliveryArea.instructions ? (
                    <p className="text-muted-foreground text-xs">{deliveryArea.instructions}</p>
                  ) : null}
                </form>
              )}
              {message ? (
                <p aria-live="polite" className="mt-3 text-sm" role="status">
                  {message}
                </p>
              ) : null}
            </div>
          </details>
        )}
      </div>
    </fieldset>
  );
}

function formatPostalCode(postalCode: string): string {
  return `${postalCode.slice(0, 3)} ${postalCode.slice(3)}`;
}

/** Keeps the apartment identifier visible without including it in the geofence lookup. */
function formatDeliveryAddress(address: { line1: string; unit?: string }): string {
  return address.unit ? `Unit ${address.unit}, ${address.line1}` : address.line1;
}

type OptionProps = {
  checked: boolean;
  label: string;
  name: string;
  onSelect: (method: CartFulfillmentMethod) => void;
  value: CartFulfillmentMethod;
};

/** Native radios stay in the markup so arrow-key navigation keeps working. */
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
