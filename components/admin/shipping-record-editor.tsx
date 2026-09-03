"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { updateOrderShippingRecord } from "@/lib/actions/orders";
import type { ActionFailure } from "@/lib/actions/result";
import { centsToDollars, formatMoney } from "@/lib/money";
import {
  type AdminOrderShippingRecordInput,
  adminOrderShippingRecordSchema,
} from "@/lib/validators/shipping-record";

type ShippingRecordEditorProps = {
  actualCostCents: number | null;
  actualCostUnknown: boolean;
  currency: string;
  orderId: string;
  packedWeightGrams: number | null;
  packedWeightUnknown: boolean;
  shippingChargedCents: number;
};

/** Maps the persisted value, unknown, and pending states into the complete admin form shape. */
function toDefaultValues(props: ShippingRecordEditorProps): AdminOrderShippingRecordInput {
  return {
    orderId: props.orderId,
    actualCostDollars: props.actualCostCents === null ? "" : centsToDollars(props.actualCostCents),
    actualCostUnknown: props.actualCostUnknown,
    packedWeightGrams: props.packedWeightGrams === null ? "" : props.packedWeightGrams.toString(),
    packedWeightUnknown: props.packedWeightUnknown,
  };
}

/** Describes the per-order flat-rate difference without implying that packaging is included. */
function shippingDifferenceCopy(
  shippingChargedCents: number,
  actualCostCents: number | null,
  currency: string,
): string | null {
  if (actualCostCents === null) {
    return null;
  }

  const differenceCents = shippingChargedCents - actualCostCents;

  if (differenceCents === 0) {
    return "The customer charge exactly covered the carrier cost.";
  }

  return differenceCents > 0
    ? `${formatMoney(differenceCents, currency)} above carrier cost.`
    : `${formatMoney(Math.abs(differenceCents), currency)} below carrier cost.`;
}

/** Captures the parcel facts that let the operator check whether flat shipping rates are working. */
export function ShippingRecordEditor(props: ShippingRecordEditorProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const form = useForm<AdminOrderShippingRecordInput>({
    defaultValues: toDefaultValues(props),
    resolver: zodResolver(adminOrderShippingRecordSchema),
  });
  const actualCostUnknown = form.watch("actualCostUnknown");
  const packedWeightUnknown = form.watch("packedWeightUnknown");
  const isComplete =
    (props.actualCostCents !== null || props.actualCostUnknown) &&
    (props.packedWeightGrams !== null || props.packedWeightUnknown);
  const differenceCopy = shippingDifferenceCopy(
    props.shippingChargedCents,
    props.actualCostCents,
    props.currency,
  );

  /** Maps server validation errors back onto the corresponding form controls. */
  function showActionFailure(result: ActionFailure) {
    for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) {
      const message = messages?.[0];

      if (message) {
        form.setError(path as FieldPath<AdminOrderShippingRecordInput>, {
          message,
          type: "server",
        });
      }
    }

    setActionError(result.message);
  }

  /** Saves both measurements as one record so the completion state cannot be half-updated. */
  async function onSubmit(values: AdminOrderShippingRecordInput) {
    setActionError(null);
    setSuccessMessage(null);

    try {
      const result = await updateOrderShippingRecord(values);

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      form.reset(values);
      setSuccessMessage("Shipping record saved.");
      router.refresh();
    } catch {
      setActionError("The shipping record could not be saved. Try again shortly.");
    }
  }

  function setUnknown(
    field: "actualCostUnknown" | "packedWeightUnknown",
    valueField: "actualCostDollars" | "packedWeightGrams",
    checked: boolean,
  ) {
    if (checked) {
      form.setValue(valueField, "", { shouldDirty: true, shouldValidate: true });
    }
    form.setValue(field, checked, { shouldDirty: true, shouldValidate: true });
    setSuccessMessage(null);
  }

  return (
    <section aria-labelledby="shipping-record-heading" className="border-b pb-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-semibold" id="shipping-record-heading">
          Shipping record
        </h3>
        <Badge variant="outline">{isComplete ? "Complete" : "Incomplete"}</Badge>
      </div>
      <p className="mt-2 text-muted-foreground text-sm">
        Customer charged {formatMoney(props.shippingChargedCents, props.currency)} for shipping.
        {differenceCopy ? ` ${differenceCopy}` : ""}
      </p>
      <p className="mt-3 text-muted-foreground text-sm leading-6">
        <span className="font-semibold text-foreground">Why track this?</span> We charge flat
        shipping rates. Recording the packed weight and actual carrier charge shows whether those
        rates cover real shipments, especially decks sent longer distances. If either value is
        unavailable, mark it unknown instead of guessing.
      </p>

      <form className="mt-4 space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
        <input type="hidden" {...form.register("orderId")} />
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="font-semibold text-sm" htmlFor="shipping-actual-cost">
              Actual carrier cost
            </label>
            <p className="mt-1 text-muted-foreground text-xs" id="shipping-actual-cost-hint">
              Complete label charge in CAD, including carrier surcharges and tax. Exclude packaging.
            </p>
            <div className="relative mt-2">
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-3 flex items-center text-muted-foreground"
              >
                $
              </span>
              <Input
                aria-describedby={`shipping-actual-cost-hint${form.formState.errors.actualCostDollars ? " shipping-actual-cost-error" : ""}`}
                aria-invalid={form.formState.errors.actualCostDollars ? true : undefined}
                className="pl-7 tabular-nums"
                disabled={actualCostUnknown}
                id="shipping-actual-cost"
                inputMode="decimal"
                placeholder="0.00"
                {...form.register("actualCostDollars")}
              />
            </div>
            {form.formState.errors.actualCostDollars?.message ? (
              <p className="mt-1 text-destructive text-xs" id="shipping-actual-cost-error">
                {form.formState.errors.actualCostDollars.message}
              </p>
            ) : null}
            <label
              className="mt-2 flex w-fit items-center gap-2 text-sm"
              htmlFor="shipping-actual-cost-unknown"
            >
              <Checkbox
                checked={actualCostUnknown}
                id="shipping-actual-cost-unknown"
                onCheckedChange={(checked) =>
                  setUnknown("actualCostUnknown", "actualCostDollars", checked === true)
                }
              />
              Carrier cost unknown
            </label>
          </div>

          <div>
            <label className="font-semibold text-sm" htmlFor="packed-weight-grams">
              Packed weight
            </label>
            <p className="mt-1 text-muted-foreground text-xs" id="packed-weight-grams-hint">
              Whole grams after the order is fully packed.
            </p>
            <div className="relative mt-2">
              <Input
                aria-describedby={`packed-weight-grams-hint${form.formState.errors.packedWeightGrams ? " packed-weight-grams-error" : ""}`}
                aria-invalid={form.formState.errors.packedWeightGrams ? true : undefined}
                className="pr-14 tabular-nums"
                disabled={packedWeightUnknown}
                id="packed-weight-grams"
                inputMode="numeric"
                placeholder="0"
                {...form.register("packedWeightGrams")}
              />
              <span
                aria-hidden="true"
                className="absolute inset-y-0 right-3 flex items-center text-muted-foreground"
              >
                grams
              </span>
            </div>
            {form.formState.errors.packedWeightGrams?.message ? (
              <p className="mt-1 text-destructive text-xs" id="packed-weight-grams-error">
                {form.formState.errors.packedWeightGrams.message}
              </p>
            ) : null}
            <label
              className="mt-2 flex w-fit items-center gap-2 text-sm"
              htmlFor="packed-weight-unknown"
            >
              <Checkbox
                checked={packedWeightUnknown}
                id="packed-weight-unknown"
                onCheckedChange={(checked) =>
                  setUnknown("packedWeightUnknown", "packedWeightGrams", checked === true)
                }
              />
              Packed weight unknown
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={form.formState.isSubmitting || !form.formState.isDirty} size="sm">
            {form.formState.isSubmitting ? "Saving…" : "Save shipping record"}
          </Button>
          {actionError ? (
            <p className="text-destructive text-sm" role="alert">
              {actionError}
            </p>
          ) : null}
          <p aria-live="polite" className="text-emerald-700 text-sm" role="status">
            {successMessage}
          </p>
        </div>
      </form>
    </section>
  );
}
