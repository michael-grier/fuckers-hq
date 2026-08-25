"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldPath, useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionFailure } from "@/lib/actions/result";
import { updateShippingRates } from "@/lib/actions/shipping-rates";
import type { ShippingProfile } from "@/lib/catalog/shipping-profiles";
import { centsToDollars } from "@/lib/money";
import {
  type AdminShippingRatesFormInput,
  adminShippingRatesFormSchema,
} from "@/lib/validators/shipping-rates";

export type ShippingRateEditorRow = {
  value: ShippingProfile;
  label: string;
  description: string;
  rateCents: number | null;
  productCount: number;
};

type ShippingRateEditorProps = {
  rates: ReadonlyArray<ShippingRateEditorRow>;
};

/** Converts nullable persisted cents into the complete dollar-string form shape. */
function toDefaultValues(rates: ReadonlyArray<ShippingRateEditorRow>): AdminShippingRatesFormInput {
  const values: AdminShippingRatesFormInput = { deck: "", softgood: "", flat: "" };

  for (const rate of rates) {
    values[rate.value] = rate.rateCents === null ? "" : centsToDollars(rate.rateCents);
  }

  return values;
}

/** Edits all checkout shipping profiles as one saved configuration. */
export function ShippingRateEditor({ rates }: ShippingRateEditorProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const form = useForm<AdminShippingRatesFormInput>({
    defaultValues: toDefaultValues(rates),
    resolver: zodResolver(adminShippingRatesFormSchema),
  });

  /** Maps server-side validation errors back onto their matching rate inputs. */
  function showActionFailure(result: ActionFailure) {
    for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) {
      const message = messages?.[0];

      if (message) {
        form.setError(path as FieldPath<AdminShippingRatesFormInput>, {
          message,
          type: "server",
        });
      }
    }

    setActionError(result.message);
  }

  /** Saves the complete rate set and refreshes usage counts after the transaction commits. */
  async function onSubmit(values: AdminShippingRatesFormInput) {
    setActionError(null);
    setSuccessMessage(null);

    try {
      const result = await updateShippingRates(values);

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      form.reset(values);
      setSuccessMessage("Shipping rates saved.");
      router.refresh();
    } catch {
      setActionError("The shipping rates could not be saved. Try again shortly.");
    }
  }

  return (
    <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 max-w-2xl flex-1 space-y-2">
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">Shipping rates</h1>
          <p className="text-muted-foreground">
            Set the amount charged for each product profile. Checkout uses the most expensive
            profile in the cart.
          </p>
        </div>
        <Button
          className="w-full rounded-full bg-accent text-accent-foreground hover:bg-accent/90 sm:w-auto"
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
          type="submit"
        >
          {form.formState.isSubmitting ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-background">
        <table className="w-full">
          <thead className="hidden border-b bg-muted/40 text-left md:table-header-group">
            <tr>
              <th className="px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Profile
              </th>
              <th className="px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Used by
              </th>
              <th className="w-64 px-6 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                Rate
              </th>
            </tr>
          </thead>
          <tbody className="block divide-y md:table-row-group">
            {rates.map((rate) => {
              const error = form.formState.errors[rate.value]?.message;
              const inputId = `shipping-rate-${rate.value}`;

              return (
                <tr
                  className="grid grid-cols-[minmax(0,1fr)_minmax(9rem,12rem)] gap-x-4 gap-y-1 px-4 py-5 md:table-row md:px-0 md:py-0"
                  key={rate.value}
                >
                  <td className="col-start-1 row-start-1 min-w-0 md:table-cell md:px-6 md:py-5">
                    <p className="font-semibold">{rate.label}</p>
                    <p className="mt-1 text-muted-foreground text-sm">{rate.description}</p>
                  </td>
                  <td className="col-start-1 row-start-2 text-muted-foreground text-sm md:table-cell md:px-6 md:py-5">
                    {rate.productCount} {rate.productCount === 1 ? "product" : "products"}
                  </td>
                  <td className="col-start-2 row-span-2 row-start-1 md:table-cell md:px-6 md:py-5">
                    <label className="sr-only" htmlFor={inputId}>
                      {rate.label} rate in Canadian dollars
                    </label>
                    <div className="relative">
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-3 flex items-center text-muted-foreground"
                      >
                        $
                      </span>
                      <Input
                        aria-describedby={error ? `${inputId}-error` : undefined}
                        aria-invalid={error ? true : undefined}
                        className="pl-7 tabular-nums"
                        id={inputId}
                        inputMode="decimal"
                        {...form.register(rate.value)}
                      />
                    </div>
                    {error ? (
                      <p className="mt-1 text-destructive text-xs" id={`${inputId}-error`}>
                        {error}
                      </p>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <section className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
        <p className="font-semibold">When rates change</p>
        <p className="mt-1 text-muted-foreground">
          New checkouts use saved rates immediately. Existing checkout sessions keep the rate
          already quoted.
        </p>
      </section>

      {actionError ? (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}
      <p aria-live="polite" className="text-emerald-700 text-sm" role="status">
        {successMessage}
      </p>
    </form>
  );
}
