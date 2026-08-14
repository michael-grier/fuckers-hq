"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type FieldPath, useFieldArray, useForm } from "react-hook-form";

import { ConfirmButton } from "@/components/admin/confirm-button";
import {
  adminSelectClassName,
  adminTextareaClassName,
  FormField,
} from "@/components/admin/form-field";
import { MoveButtons } from "@/components/admin/move-buttons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveProductWorkspace, type WorkspaceVariantRow } from "@/lib/actions/product-workspace";
import { archiveProduct, deleteProduct } from "@/lib/actions/products";
import type { ActionFailure } from "@/lib/actions/result";
import { deleteVariant, moveVariant } from "@/lib/actions/variants";
import type { VariantMoveDirection } from "@/lib/admin/variant-order";
import {
  getProductSubcategoryOptions,
  isProductCategory,
  productCategories,
} from "@/lib/catalog/categories";
import {
  type AdminProductWorkspaceFormInput,
  adminProductWorkspaceFormSchema,
} from "@/lib/validators/product";

type ProductWorkspaceProps = {
  productId: string;
  /** Status as persisted — variant deletion rules follow the database, not unsaved edits. */
  savedStatus: "draft" | "active" | "archived";
  defaultValues: AdminProductWorkspaceFormInput;
  /** Reserved quantities per persisted variant id; checkout owns these. */
  reservedQuantities: Record<string, number>;
  /** The Media panel, rendered inside the main column but outside the form. */
  media: React.ReactNode;
};

const emptyVariantRow = { name: "", sku: "", price: "", inventory: "0" };

const statusOptions = [
  { value: "draft", label: "Draft" },
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;

/**
 * The whole product detail page as one form: product fields and every variant
 * row save together through saveProductWorkspace, surfaced by a sticky save
 * bar that appears while anything is dirty. Reordering and deletion remain
 * immediate, individually confirmed actions.
 */
export function ProductWorkspace({
  productId,
  savedStatus,
  defaultValues,
  reservedQuantities,
  media,
}: ProductWorkspaceProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMovingVariant, setIsMovingVariant] = useState(false);
  const [deletingVariantId, setDeletingVariantId] = useState<string | null>(null);
  // Read straight from props rather than held in state: checkout owns these
  // numbers, so a router.refresh() after any activity has to be able to correct
  // the availability column rather than leave a stale snapshot on screen.
  const reservedById = reservedQuantities;
  const form = useForm<AdminProductWorkspaceFormInput>({
    defaultValues,
    resolver: zodResolver(adminProductWorkspaceFormSchema),
  });
  const variantRows = useFieldArray({ control: form.control, name: "variants" });

  const errors = form.formState.errors;
  const isDirty = form.formState.isDirty;
  const busy =
    form.formState.isSubmitting ||
    isArchiving ||
    isDeleting ||
    isMovingVariant ||
    deletingVariantId !== null;
  const watchedVariants = form.watch("variants");
  const watchedStatus = form.watch("status");
  const watchedCategory = form.watch("category");
  const subcategoryOptions = isProductCategory(watchedCategory)
    ? getProductSubcategoryOptions(watchedCategory)
    : [];

  function showActionFailure(result: ActionFailure) {
    for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) {
      const message = messages?.[0];

      if (message) {
        form.setError(path as FieldPath<AdminProductWorkspaceFormInput>, {
          message,
          type: "server",
        });
      }
    }

    setActionError(result.message);
  }

  async function onSubmit(values: AdminProductWorkspaceFormInput) {
    setActionError(null);
    setSuccessMessage(null);

    let result: Awaited<ReturnType<typeof saveProductWorkspace>>;

    try {
      result = await saveProductWorkspace({ ...values, productId });
    } catch {
      setActionError("The product could not be saved. Try again shortly.");
      return;
    }

    if (!result.success) {
      showActionFailure(result);
      return;
    }

    // Reset with the server's rows so newly inserted variants pick up their
    // real ids; otherwise the next save would insert them again.
    form.reset({
      name: values.name,
      slug: values.slug,
      description: values.description,
      category: values.category,
      subcategory: values.subcategory,
      status: values.status,
      variants: result.data.variants.map(toFormRow),
    });
    setSuccessMessage("Product saved.");
    // Reserved quantities come back with the refreshed props.
    router.refresh();
  }

  async function onArchive() {
    setActionError(null);
    setSuccessMessage(null);
    setIsArchiving(true);

    try {
      const result = await archiveProduct({ productId });

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      form.reset({ ...form.getValues(), status: "archived" });
      setSuccessMessage("Product archived.");
      router.refresh();
    } catch {
      setActionError("The product could not be archived. Try again shortly.");
    } finally {
      setIsArchiving(false);
    }
  }

  async function onDelete() {
    setActionError(null);
    setSuccessMessage(null);
    setIsDeleting(true);

    try {
      const result = await deleteProduct({ productId });

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      router.push("/admin/products");
      router.refresh();
    } catch {
      setActionError("The product could not be deleted. Try again shortly.");
    } finally {
      setIsDeleting(false);
    }
  }

  async function onDeleteVariant(index: number) {
    const row = watchedVariants[index];

    if (!row) {
      return;
    }

    // A row that was never saved only exists in the form.
    if (!row.variantId) {
      variantRows.remove(index);
      return;
    }

    setActionError(null);
    setSuccessMessage(null);
    setDeletingVariantId(row.variantId);

    try {
      const result = await deleteVariant({ productId, variantId: row.variantId });

      if (!result.success) {
        setActionError(result.message);
        return;
      }

      variantRows.remove(index);
      router.refresh();
    } catch {
      setActionError("The variant could not be deleted. Try again shortly.");
    } finally {
      setDeletingVariantId(null);
    }
  }

  async function onMoveVariant(index: number, direction: VariantMoveDirection) {
    const row = watchedVariants[index];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const neighbor = watchedVariants[targetIndex];

    // isMovingVariant feeds `busy`, which disables the arrows: a second move
    // issued while the first is in flight would send a direction derived from
    // the optimistic order while the server still holds the previous one.
    if (!row?.variantId || !neighbor?.variantId || isMovingVariant) {
      return;
    }

    setActionError(null);
    const wasDirty = form.formState.isDirty;
    variantRows.move(index, targetIndex);
    setIsMovingVariant(true);

    try {
      const result = await moveVariant({
        productId,
        variantId: row.variantId,
        direction,
      });

      if (!result.success) {
        variantRows.move(targetIndex, index);
        setActionError(result.message);
        return;
      }

      // A move persists immediately, but reordering the field array makes the
      // form compare unequal to its defaults. Re-baseline a clean form so the
      // save bar does not claim unsaved changes after a pure reorder.
      if (!wasDirty) {
        form.reset(form.getValues());
      }

      router.refresh();
    } catch {
      variantRows.move(targetIndex, index);
      setActionError("The variant could not be moved. Try again shortly.");
    } finally {
      setIsMovingVariant(false);
    }
  }

  const inventoryTotals = summarizeInventory(watchedVariants, reservedById);

  // Not a <form>: the Media panel nests real forms of its own (uploader,
  // per-image alt), and forms cannot nest. react-hook-form tracks inputs via
  // refs, so the save button submits programmatically instead.
  return (
    <div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ===== Main column ===== */}
        <div className="min-w-0 space-y-4">
          <section aria-labelledby="details-heading" className="rounded-lg border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="font-bold text-lg" id="details-heading">
                Details
              </h2>
              <p className="text-muted-foreground text-xs">
                Public catalog pages update after each saved change.
              </p>
            </div>
            <div className="space-y-5 p-5">
              {/* Three across once there is room, so the required Category field
                  sits on the same line rather than below a ragged first row. */}
              <div className="grid gap-x-6 gap-y-4 md:grid-cols-2 lg:grid-cols-3">
                <FormField error={errors.name?.message} id="name" label="Name">
                  <Input
                    aria-describedby={errors.name ? "name-error" : undefined}
                    aria-invalid={Boolean(errors.name)}
                    id="name"
                    {...form.register("name")}
                  />
                </FormField>

                <FormField error={errors.slug?.message} id="slug" label="Slug">
                  <div className="flex">
                    {/* shrink-0 keeps the prefix at its natural width: as a flex item it
                        would otherwise compress and wrap "/products/" onto two lines. */}
                    <span className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-l-md border border-input border-r bg-muted px-3 text-muted-foreground text-sm">
                      /products/
                    </span>
                    <Input
                      aria-describedby={errors.slug ? "slug-error" : "slug-help"}
                      aria-invalid={Boolean(errors.slug)}
                      autoCapitalize="none"
                      className="rounded-l-none border-l-0"
                      id="slug"
                      spellCheck={false}
                      {...form.register("slug")}
                    />
                  </div>
                  {!errors.slug ? (
                    <p className="mt-1 text-muted-foreground text-xs" id="slug-help">
                      Lowercase letters, numbers, and hyphens only.
                    </p>
                  ) : null}
                </FormField>

                <FormField error={errors.category?.message} id="category" label="Category">
                  <select
                    aria-describedby={errors.category ? "category-error" : "category-help"}
                    aria-invalid={Boolean(errors.category)}
                    className={adminSelectClassName}
                    id="category"
                    {...form.register("category", {
                      // The subcategory belongs to the previous category, so it cannot survive
                      // the change without producing an invalid pair.
                      onChange: () => form.setValue("subcategory", ""),
                    })}
                  >
                    <option value="">Select a category</option>
                    {productCategories.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                  {!errors.category ? (
                    <p className="mt-1 text-muted-foreground text-xs" id="category-help">
                      Skate parts, apparel, or small items like stickers and keychains.
                    </p>
                  ) : null}
                </FormField>

                <FormField error={errors.subcategory?.message} id="subcategory" label="Subcategory">
                  <select
                    aria-describedby={errors.subcategory ? "subcategory-error" : "subcategory-help"}
                    aria-invalid={Boolean(errors.subcategory)}
                    className={adminSelectClassName}
                    disabled={subcategoryOptions.length === 0}
                    id="subcategory"
                    {...form.register("subcategory")}
                  >
                    <option value="">
                      {subcategoryOptions.length === 0
                        ? "Select a category first"
                        : "Select a subcategory"}
                    </option>
                    {subcategoryOptions.map((subcategory) => (
                      <option key={subcategory.value} value={subcategory.value}>
                        {subcategory.label}
                      </option>
                    ))}
                  </select>
                  {!errors.subcategory ? (
                    <p className="mt-1 text-muted-foreground text-xs" id="subcategory-help">
                      Changing the category clears the subcategory so the pair always matches.
                    </p>
                  ) : null}
                </FormField>
              </div>

              <FormField error={errors.description?.message} id="description" label="Description">
                <textarea
                  aria-describedby={errors.description ? "description-error" : undefined}
                  aria-invalid={Boolean(errors.description)}
                  className={adminTextareaClassName}
                  id="description"
                  {...form.register("description")}
                />
              </FormField>
            </div>
          </section>

          {media}

          <section
            aria-labelledby="variants-heading"
            className="overflow-hidden rounded-lg border bg-background"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="font-bold text-lg" id="variants-heading">
                  Variants
                </h2>
                <p className="text-muted-foreground text-xs">
                  Rows save together with the product. Reserved counts are owned by checkout.
                </p>
              </div>
            </div>

            {/* relative: sr-only labels inside the table are absolutely positioned, and without
                a positioned ancestor they escape this scroll container and widen the page on
                small screens. */}
            <div className="relative overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Variants of this product</caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="w-24 whitespace-nowrap px-3 py-3 font-semibold" scope="col">
                      Order
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold" scope="col">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold" scope="col">
                      SKU
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold" scope="col">
                      Price (CAD)
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold" scope="col">
                      On hand
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 font-semibold" scope="col">
                      Available
                    </th>
                    <th className="w-24 px-3 py-3" scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {variantRows.fields.map((field, index) => {
                    const row = watchedVariants[index];
                    const rowErrors = errors.variants?.[index];
                    const reservedQty = row?.variantId ? (reservedById[row.variantId] ?? 0) : 0;
                    const neighborUp = watchedVariants[index - 1];
                    const neighborDown = watchedVariants[index + 1];
                    const rowLabel = row?.name || row?.sku || `row ${index + 1}`;

                    return (
                      <tr className="align-top" key={field.id}>
                        <td className="px-3 py-2.5">
                          {row?.variantId ? (
                            <MoveButtons
                              canMoveDown={Boolean(neighborDown?.variantId)}
                              canMoveUp={Boolean(neighborUp?.variantId)}
                              disabled={busy}
                              itemLabel={rowLabel}
                              onMove={(direction) => onMoveVariant(index, direction)}
                            />
                          ) : (
                            <span className="inline-flex h-8 items-center text-muted-foreground text-xs">
                              New
                            </span>
                          )}
                        </td>
                        <td className="min-w-28 px-3 py-2.5">
                          <VariantCell error={rowErrors?.name?.message} id={`${field.id}-name`}>
                            <Input
                              aria-describedby={
                                rowErrors?.name ? `${field.id}-name-error` : undefined
                              }
                              aria-invalid={Boolean(rowErrors?.name)}
                              aria-label={`Variant ${index + 1} name`}
                              className="h-9"
                              placeholder='8.25"'
                              {...form.register(`variants.${index}.name`)}
                            />
                          </VariantCell>
                        </td>
                        <td className="min-w-32 px-3 py-2.5">
                          <VariantCell error={rowErrors?.sku?.message} id={`${field.id}-sku`}>
                            <Input
                              aria-describedby={
                                rowErrors?.sku ? `${field.id}-sku-error` : undefined
                              }
                              aria-invalid={Boolean(rowErrors?.sku)}
                              aria-label={`Variant ${index + 1} SKU`}
                              className="h-9 font-mono"
                              spellCheck={false}
                              {...form.register(`variants.${index}.sku`)}
                            />
                          </VariantCell>
                        </td>
                        <td className="min-w-28 px-3 py-2.5">
                          <VariantCell error={rowErrors?.price?.message} id={`${field.id}-price`}>
                            <div className="flex">
                              <span className="inline-flex h-9 items-center rounded-l-md border border-input bg-muted px-2.5 text-muted-foreground text-sm">
                                $
                              </span>
                              <Input
                                aria-describedby={
                                  rowErrors?.price ? `${field.id}-price-error` : undefined
                                }
                                aria-invalid={Boolean(rowErrors?.price)}
                                aria-label={`Variant ${index + 1} price in dollars`}
                                className="h-9 rounded-l-none border-l-0 tabular-nums"
                                inputMode="decimal"
                                placeholder="89.00"
                                {...form.register(`variants.${index}.price`)}
                              />
                            </div>
                          </VariantCell>
                        </td>
                        <td className="min-w-20 px-3 py-2.5">
                          <VariantCell
                            error={rowErrors?.inventory?.message}
                            id={`${field.id}-inventory`}
                          >
                            <Input
                              aria-describedby={
                                rowErrors?.inventory ? `${field.id}-inventory-error` : undefined
                              }
                              aria-invalid={Boolean(rowErrors?.inventory)}
                              aria-label={`Variant ${index + 1} on-hand inventory`}
                              className="h-9 tabular-nums"
                              inputMode="numeric"
                              {...form.register(`variants.${index}.inventory`)}
                            />
                          </VariantCell>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5">
                          <AvailabilityCell inventory={row?.inventory} reservedQty={reservedQty} />
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {row?.variantId ? (
                            <ConfirmButton
                              confirmLabel="Yes, delete"
                              confirmMessage={`Delete ${row.name || row.sku || "this variant"}?`}
                              destructive
                              disabled={busy || savedStatus === "active"}
                              onConfirm={() => void onDeleteVariant(index)}
                              size="sm"
                              variant="ghost"
                            >
                              {deletingVariantId === row.variantId ? "Deleting…" : "Delete"}
                            </ConfirmButton>
                          ) : (
                            // Unsaved rows exist only in the form, so removing one needs no
                            // confirmation step.
                            <Button
                              disabled={busy}
                              onClick={() => onDeleteVariant(index)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              Delete
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3">
              <Button
                disabled={busy}
                onClick={() => variantRows.append(emptyVariantRow)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Add variant
              </Button>
              {savedStatus === "active" ? (
                <p className="text-muted-foreground text-xs">
                  Set the product to draft or archived before deleting a variant.
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* ===== Right rail ===== */}
        <div className="space-y-4">
          <section aria-labelledby="status-heading" className="rounded-lg border bg-background">
            <div className="border-b px-4 py-3.5">
              <h2 className="font-bold text-base" id="status-heading">
                Status
              </h2>
            </div>
            <div className="space-y-3 p-4">
              <div
                aria-label="Product status"
                className="grid grid-cols-3 rounded-md border p-0.5 text-center"
                role="radiogroup"
              >
                {statusOptions.map((option) => (
                  <label className="relative" key={option.value}>
                    <input
                      className="peer sr-only"
                      type="radio"
                      value={option.value}
                      {...form.register("status")}
                    />
                    <span className="block cursor-pointer rounded-[5px] px-2 py-1.5 font-semibold text-muted-foreground text-sm transition hover:text-foreground peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
                      {option.label}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {watchedStatus === "active"
                  ? "Visible on the storefront. Catalog pages update after each saved change."
                  : watchedStatus === "archived"
                    ? "Hidden from the storefront. Order history is kept."
                    : "Hidden from the storefront until published."}
              </p>
            </div>
          </section>

          <section aria-labelledby="inventory-heading" className="rounded-lg border bg-background">
            <div className="border-b px-4 py-3.5">
              <h2 className="font-bold text-base" id="inventory-heading">
                Inventory at a glance
              </h2>
            </div>
            <dl className="divide-y text-sm">
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">On hand</dt>
                <dd className="font-grotesk font-semibold text-lg tabular-nums">
                  {inventoryTotals.onHand}
                </dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">Reserved</dt>
                <dd className="font-grotesk font-semibold text-lg tabular-nums">
                  {inventoryTotals.reserved}
                </dd>
              </div>
              <div className="flex items-center justify-between px-4 py-2.5">
                <dt className="text-muted-foreground">Out of stock</dt>
                <dd
                  className={
                    inventoryTotals.outOfStock > 0
                      ? "font-grotesk font-semibold text-destructive text-lg tabular-nums"
                      : "font-grotesk font-semibold text-lg tabular-nums"
                  }
                >
                  {inventoryTotals.outOfStock === 1
                    ? "1 variant"
                    : `${inventoryTotals.outOfStock} variants`}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="danger-heading"
            className="rounded-lg border border-destructive/30 bg-background"
          >
            <div className="border-destructive/20 border-b px-4 py-3.5">
              <h2 className="font-bold text-base text-destructive" id="danger-heading">
                Danger zone
              </h2>
            </div>
            <div className="space-y-3 p-4">
              {savedStatus !== "archived" ? (
                <>
                  <ConfirmButton
                    className="w-full"
                    confirmLabel="Yes, archive"
                    confirmMessage="Remove from the storefront?"
                    disabled={busy || isDirty}
                    onConfirm={() => void onArchive()}
                    variant="destructive"
                  >
                    {isArchiving ? "Archiving…" : "Archive product"}
                  </ConfirmButton>
                  <p className="text-muted-foreground text-xs">
                    {isDirty
                      ? "Save your changes before archiving."
                      : "Hides the product from the storefront. Order history is kept, and you can re-activate later."}
                  </p>
                </>
              ) : null}
              <ConfirmButton
                className="w-full"
                confirmLabel="Yes, delete"
                confirmMessage="This cannot be undone."
                disabled={busy || isDirty || savedStatus === "active"}
                onConfirm={() => void onDelete()}
                variant="destructive"
              >
                {isDeleting ? "Deleting…" : "Delete product"}
              </ConfirmButton>
              <p className="text-muted-foreground text-xs">
                {savedStatus === "active"
                  ? "Set the product to draft or archived before deleting it."
                  : isDirty
                    ? "Save your changes before deleting."
                    : "Permanently removes the product, its variants, and its images. Only possible while it has no order or checkout history."}
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* Mounted for the life of the page: several screen readers only announce
          changes inside a live region that already existed, and the save bar
          below appears at the same moment its message does. */}
      <p aria-live="polite" className="sr-only" role="status">
        {successMessage ?? ""}
      </p>

      {/* ===== Sticky save bar, visible only while something is unsaved ===== */}
      {isDirty || actionError || successMessage ? (
        <div className="sticky bottom-4 z-30 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-surface-chrome px-4 py-3 text-white shadow-lg">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              {actionError ? (
                <p className="text-red-300" role="alert">
                  {actionError}
                </p>
              ) : isDirty ? (
                <>
                  <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
                  <p className="font-medium">Unsaved changes</p>
                </>
              ) : (
                <p>{successMessage}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                className="text-white/80 hover:bg-white/10 hover:text-white"
                disabled={busy || !isDirty}
                onClick={() => {
                  setActionError(null);
                  setSuccessMessage(null);
                  form.reset();
                }}
                size="sm"
                type="button"
                variant="ghost"
              >
                Discard
              </Button>
              <Button
                className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={busy || !isDirty}
                onClick={form.handleSubmit(onSubmit)}
                size="sm"
                type="button"
              >
                {form.formState.isSubmitting ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function toFormRow(row: WorkspaceVariantRow) {
  return {
    variantId: row.variantId,
    name: row.name,
    sku: row.sku,
    price: row.price,
    inventory: row.inventory,
  };
}

function VariantCell({
  children,
  error,
  id,
}: {
  children: React.ReactNode;
  error?: string;
  id: string;
}) {
  return (
    <div>
      {children}
      {error ? (
        <p className="mt-1 text-destructive text-xs" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AvailabilityCell({
  inventory,
  reservedQty,
}: {
  inventory: string | undefined;
  reservedQty: number;
}) {
  const onHand = /^\d+$/.test(inventory ?? "") ? Number(inventory) : null;

  if (onHand === null) {
    return <span className="text-muted-foreground text-xs">—</span>;
  }

  const available = onHand - reservedQty;

  if (available <= 0) {
    return (
      <span className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-800 text-xs">
        Out of stock
      </span>
    );
  }

  return (
    <span className="text-sm">
      <span className="font-semibold tabular-nums">{available}</span>
      {reservedQty > 0 ? (
        <span className="text-muted-foreground text-xs"> · {reservedQty} reserved</span>
      ) : null}
    </span>
  );
}

function summarizeInventory(
  variants: ReadonlyArray<{ variantId?: string; inventory: string }> | undefined,
  reservedById: Record<string, number>,
) {
  let onHand = 0;
  let reserved = 0;
  let outOfStock = 0;

  for (const row of variants ?? []) {
    const rowReserved = row.variantId ? (reservedById[row.variantId] ?? 0) : 0;
    reserved += rowReserved;

    if (!/^\d+$/.test(row.inventory)) {
      continue;
    }

    const rowOnHand = Number(row.inventory);
    onHand += rowOnHand;

    if (rowOnHand - rowReserved <= 0) {
      outOfStock += 1;
    }
  }

  return { onHand, reserved, outOfStock };
}
