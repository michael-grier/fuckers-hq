"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionFailure } from "@/lib/actions/result";
import { createVariant, deleteVariant, moveVariant, updateVariant } from "@/lib/actions/variants";
import type { VariantMoveDirection } from "@/lib/admin/variant-order";
import { centsToDollars } from "@/lib/money";
import { type AdminVariantFormInput, adminVariantFormSchema } from "@/lib/validators/product";

type ExistingVariant = {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  inventoryQty: number;
  reservedQty: number;
};

type VariantFormProps = {
  productId: string;
  productStatus: "draft" | "active" | "archived";
  variant?: ExistingVariant;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
};

const emptyVariant: AdminVariantFormInput = {
  name: "",
  sku: "",
  price: "",
  inventory: "0",
};

const variantFieldNames = ["name", "sku", "price", "inventory"] as const;

export function VariantForm({
  productId,
  productStatus,
  variant,
  canMoveUp = false,
  canMoveDown = false,
}: VariantFormProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const defaultValues = variant
    ? {
        name: variant.name,
        sku: variant.sku,
        price: centsToDollars(variant.priceCents),
        inventory: String(variant.inventoryQty),
      }
    : emptyVariant;
  const form = useForm<AdminVariantFormInput>({
    defaultValues,
    resolver: zodResolver(adminVariantFormSchema),
  });

  function showActionFailure(result: ActionFailure) {
    for (const field of variantFieldNames) {
      const message = result.fieldErrors?.[field]?.[0];

      if (message) {
        form.setError(field, { message, type: "server" });
      }
    }

    setActionError(result.message);
  }

  async function onSubmit(values: AdminVariantFormInput) {
    setActionError(null);
    setSuccessMessage(null);

    const result = variant
      ? await updateVariant({ ...values, productId, variantId: variant.id })
      : await createVariant({ ...values, productId });

    if (!result.success) {
      showActionFailure(result);
      return;
    }

    form.reset(variant ? values : emptyVariant);
    setSuccessMessage(variant ? "Variant saved." : "Variant added.");
    router.refresh();
  }

  async function onMove(direction: VariantMoveDirection) {
    if (!variant) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);
    setIsMoving(true);

    try {
      const result = await moveVariant({ productId, variantId: variant.id, direction });

      if (!result.success) {
        setActionError(result.message);
        return;
      }

      router.refresh();
    } finally {
      setIsMoving(false);
    }
  }

  async function onDelete() {
    if (!variant || !window.confirm(`Delete ${variant.name}? This cannot be undone.`)) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);
    setIsDeleting(true);

    try {
      const result = await deleteVariant({ productId, variantId: variant.id });

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  const errors = form.formState.errors;
  const busy = form.formState.isSubmitting || isDeleting || isMoving;

  return (
    <form
      className="rounded-lg border bg-background p-5"
      data-reorder-key={variant?.id}
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      {variant ? (
        <div className="mb-4 flex items-center justify-between gap-3 border-b pb-3">
          <p className="truncate font-semibold text-muted-foreground text-xs uppercase tracking-wide">
            {variant.name} · {variant.sku}
          </p>
          <div className="flex items-center gap-1">
            <Button
              className="size-8"
              disabled={busy || !canMoveUp}
              onClick={() => onMove("up")}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronUp aria-hidden="true" />
              <span className="sr-only">Move {variant.name} up</span>
            </Button>
            <Button
              className="size-8"
              disabled={busy || !canMoveDown}
              onClick={() => onMove("down")}
              size="icon"
              type="button"
              variant="outline"
            >
              <ChevronDown aria-hidden="true" />
              <span className="sr-only">Move {variant.name} down</span>
            </Button>
          </div>
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FormField error={errors.name?.message} id={`${variant?.id ?? "new"}-name`} label="Name">
          <Input
            aria-describedby={errors.name ? `${variant?.id ?? "new"}-name-error` : undefined}
            aria-invalid={Boolean(errors.name)}
            id={`${variant?.id ?? "new"}-name`}
            placeholder='8.25"'
            {...form.register("name")}
          />
        </FormField>
        <FormField error={errors.sku?.message} id={`${variant?.id ?? "new"}-sku`} label="SKU">
          <Input
            aria-describedby={errors.sku ? `${variant?.id ?? "new"}-sku-error` : undefined}
            aria-invalid={Boolean(errors.sku)}
            id={`${variant?.id ?? "new"}-sku`}
            spellCheck={false}
            {...form.register("sku")}
          />
        </FormField>
        <FormField
          error={errors.price?.message}
          id={`${variant?.id ?? "new"}-price`}
          label="Price (CAD)"
        >
          <Input
            aria-describedby={errors.price ? `${variant?.id ?? "new"}-price-error` : undefined}
            aria-invalid={Boolean(errors.price)}
            id={`${variant?.id ?? "new"}-price`}
            inputMode="decimal"
            placeholder="89.00"
            {...form.register("price")}
          />
        </FormField>
        <FormField
          error={errors.inventory?.message}
          id={`${variant?.id ?? "new"}-inventory`}
          label="Inventory"
        >
          <Input
            aria-describedby={
              errors.inventory ? `${variant?.id ?? "new"}-inventory-error` : undefined
            }
            aria-invalid={Boolean(errors.inventory)}
            id={`${variant?.id ?? "new"}-inventory`}
            inputMode="numeric"
            {...form.register("inventory")}
          />
        </FormField>
      </div>

      {variant ? (
        <p className="mt-3 text-muted-foreground text-xs">
          {variant.inventoryQty} on hand · {variant.reservedQty} reserved ·{" "}
          {variant.inventoryQty - variant.reservedQty} available
        </p>
      ) : null}

      {actionError ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}
      {successMessage ? (
        <p className="mt-4 text-sm" role="status">
          {successMessage}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div>
          {variant ? (
            <Button
              disabled={busy || productStatus === "active"}
              onClick={onDelete}
              size="sm"
              type="button"
              variant="destructive"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          ) : null}
        </div>
        <Button disabled={busy} size="sm" type="submit">
          {form.formState.isSubmitting ? "Saving…" : variant ? "Save variant" : "Add variant"}
        </Button>
      </div>
      {variant && productStatus === "active" ? (
        <p className="mt-3 text-muted-foreground text-xs">
          Set this product to draft or archived before deleting a variant.
        </p>
      ) : null}
    </form>
  );
}

function FormField({
  children,
  error,
  id,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  id: string;
  label: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold text-sm" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-destructive text-xs" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
