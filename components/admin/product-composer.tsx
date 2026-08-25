"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Circle, ImagePlus, Plus, Trash2 } from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type FieldPath, useFieldArray, useForm } from "react-hook-form";

import {
  adminSelectClassName,
  adminTextareaClassName,
  FormField,
} from "@/components/admin/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createProductFromComposer } from "@/lib/actions/product-workspace";
import type { ActionFailure } from "@/lib/actions/result";
import { uploadProductImageFile } from "@/lib/admin/product-image-upload";
import { suggestProductSlug } from "@/lib/admin/product-slug";
import {
  getProductSubcategoryOptions,
  isProductCategory,
  productCategories,
} from "@/lib/catalog/categories";
import { shippingProfiles } from "@/lib/catalog/shipping-profiles";
import {
  allowedProductImageTypes,
  MAX_PRODUCT_IMAGE_BYTES,
  productImageUploadRequestSchema,
} from "@/lib/r2/upload-contract";
import {
  type AdminProductComposerFormInput,
  adminProductComposerFormSchema,
  adminVariantFormSchema,
} from "@/lib/validators/product";

type StagedImage = {
  objectKey: string;
  alt: string;
  previewUrl: string;
  fileName: string;
};

type ProductComposerProps = {
  r2Configured: boolean;
};

const emptyVariantRow = { name: "", sku: "", price: "", inventory: "0" };

/**
 * The new-product page as a single composer: details, images, and variant
 * rows are all editable before the first save, and one action creates the
 * whole product as a draft or publishes it immediately.
 */
export function ProductComposer({ r2Configured }: ProductComposerProps) {
  const router = useRouter();
  // Minted once per mounted composer so images can upload to R2 under the final
  // product id before the product row exists. Generated here rather than on the
  // server because a restored router-cache entry (browser Back after a create)
  // would otherwise hand a second session an id that was already consumed,
  // which the server can only reject as a duplicate product.
  const [productId] = useState(() => crypto.randomUUID());
  const [actionError, setActionError] = useState<string | null>(null);
  const [stagedImages, setStagedImages] = useState<StagedImage[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingIntent, setPendingIntent] = useState<"draft" | "publish" | null>(null);
  // Once the admin edits the slug by hand it stops tracking the name;
  // clearing the field hands control back to the suggestion.
  const slugEditedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const form = useForm<AdminProductComposerFormInput>({
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      category: "",
      subcategory: "",
      shippingProfile: "",
      variants: [emptyVariantRow],
    },
    resolver: zodResolver(adminProductComposerFormSchema),
  });
  const variantRows = useFieldArray({ control: form.control, name: "variants" });

  const errors = form.formState.errors;
  const watchedName = form.watch("name");
  const watchedSlug = form.watch("slug");
  const watchedCategory = form.watch("category");
  const watchedSubcategory = form.watch("subcategory");
  const watchedShippingProfile = form.watch("shippingProfile");
  const watchedVariants = form.watch("variants");
  const subcategoryOptions = isProductCategory(watchedCategory)
    ? getProductSubcategoryOptions(watchedCategory)
    : [];
  const busy = form.formState.isSubmitting || isUploading;

  const nameRegistration = form.register("name");
  const slugRegistration = form.register("slug");

  function showActionFailure(result: ActionFailure) {
    for (const [path, messages] of Object.entries(result.fieldErrors ?? {})) {
      const message = messages?.[0];

      if (message) {
        form.setError(path as FieldPath<AdminProductComposerFormInput>, {
          message,
          type: "server",
        });
      }
    }

    setActionError(result.message);
  }

  /** Drops rows the admin never touched so a blank row cannot block a draft. */
  function pruneEmptyVariantRows() {
    const rows = form.getValues("variants");
    const keptRows = rows.filter(
      (row) => row.name || row.sku || row.price || (row.inventory !== "" && row.inventory !== "0"),
    );

    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index];

      if (!row.name && !row.sku && !row.price && (row.inventory === "" || row.inventory === "0")) {
        variantRows.remove(index);
      }
    }

    // Returned rather than re-read through getValues: the field-array removal
    // above is applied for the next render, so the publish guard has to reason
    // about the rows this call kept.
    return keptRows;
  }

  function submitWithIntent(intent: "draft" | "publish") {
    setActionError(null);
    const keptVariants = pruneEmptyVariantRows();

    if (intent === "publish" && keptVariants.length === 0) {
      form.setError("variants", {
        message: "Add at least one variant before publishing.",
        type: "manual",
      });
      return;
    }

    void form.handleSubmit(async (values) => {
      setPendingIntent(intent);

      try {
        const result = await createProductFromComposer({
          ...values,
          variants: keptVariants,
          productId,
          intent,
          images: stagedImages.map((image) => ({ objectKey: image.objectKey, alt: image.alt })),
        });

        if (!result.success) {
          showActionFailure(result);
          return;
        }

        router.push(`/admin/products/${result.data.productId}` as Route);
      } catch {
        setActionError("The product could not be created. Try again shortly.");
      } finally {
        setPendingIntent(null);
      }
    })();
  }

  async function stageFile(file: File | undefined) {
    if (!file || !r2Configured || busy) {
      return;
    }

    setUploadError(null);

    const uploadRequest = productImageUploadRequestSchema.safeParse({
      productId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });

    if (!uploadRequest.success) {
      setUploadError("Use a JPEG, PNG, WebP, or AVIF image no larger than 5 MB.");
      return;
    }

    setIsUploading(true);

    try {
      const uploaded = await uploadProductImageFile(uploadRequest.data, file);

      if (!uploaded.success) {
        setUploadError(uploaded.error);
        return;
      }

      setStagedImages((current) => [
        ...current,
        {
          objectKey: uploaded.objectKey,
          alt: "",
          previewUrl: URL.createObjectURL(file),
          fileName: file.name,
        },
      ]);
    } catch {
      setUploadError("Image upload failed. Check the R2 configuration and try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // Paste is advertised in the upload hint, so it has to work from anywhere on
  // the page rather than only while the upload control holds focus. Pastes
  // aimed at a text field are left alone so copying a value into an input is
  // never hijacked.
  useEffect(() => {
    function onDocumentPaste(event: ClipboardEvent) {
      const target = event.target;
      const isTextEntry =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement);

      if (isTextEntry) {
        return;
      }

      const file = event.clipboardData?.files?.[0];

      if (file) {
        event.preventDefault();
        void stageFile(file);
      }
    }

    document.addEventListener("paste", onDocumentPaste);
    return () => document.removeEventListener("paste", onDocumentPaste);
  });

  function removeStagedImage(objectKey: string) {
    // The uploaded object stays in R2 unclaimed; nothing references it and it
    // can never reach the database without passing verification again.
    setStagedImages((current) => {
      const removed = current.find((image) => image.objectKey === objectKey);

      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter((image) => image.objectKey !== objectKey);
    });
  }

  const checklist = buildChecklist({
    name: watchedName,
    slug: watchedSlug,
    category: watchedCategory,
    subcategory: watchedSubcategory,
    shippingProfile: watchedShippingProfile,
    variants: watchedVariants ?? [],
    imageCount: stagedImages.length,
  });

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
                    placeholder="e.g. Hellfire Deck"
                    {...nameRegistration}
                    onChange={(event) => {
                      void nameRegistration.onChange(event);

                      if (!slugEditedRef.current) {
                        form.setValue("slug", suggestProductSlug(event.target.value));
                      }
                    }}
                  />
                </FormField>

                <FormField error={errors.slug?.message} id="slug" label="Slug">
                  <div className="flex">
                    {/* shrink-0 keeps the prefix at its natural width: as a flex item it
                        would otherwise compress and wrap "/products/" onto two lines. */}
                    <span className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-l-md border border-input bg-muted px-3 text-muted-foreground text-sm">
                      /products/
                    </span>
                    <Input
                      aria-describedby={errors.slug ? "slug-error" : "slug-help"}
                      aria-invalid={Boolean(errors.slug)}
                      autoCapitalize="none"
                      className="rounded-l-none border-l-0"
                      id="slug"
                      spellCheck={false}
                      {...slugRegistration}
                      onChange={(event) => {
                        void slugRegistration.onChange(event);
                        slugEditedRef.current = event.target.value !== "";
                      }}
                    />
                  </div>
                  {!errors.slug ? (
                    <p className="mt-1 text-muted-foreground text-xs" id="slug-help">
                      Suggested from the name — edit if you want.
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

                <FormField
                  error={errors.shippingProfile?.message}
                  id="shippingProfile"
                  label="Shipping profile"
                >
                  <select
                    aria-describedby={
                      errors.shippingProfile ? "shippingProfile-error" : "shippingProfile-help"
                    }
                    aria-invalid={Boolean(errors.shippingProfile)}
                    className={adminSelectClassName}
                    id="shippingProfile"
                    {...form.register("shippingProfile")}
                  >
                    <option value="">Select a shipping profile</option>
                    {shippingProfiles.map((profile) => (
                      <option key={profile.value} value={profile.value}>
                        {profile.label}
                      </option>
                    ))}
                  </select>
                  {!errors.shippingProfile ? (
                    <p className="mt-1 text-muted-foreground text-xs" id="shippingProfile-help">
                      Checkout uses the most expensive profile in the cart.
                    </p>
                  ) : null}
                </FormField>
              </div>

              <FormField
                error={errors.description?.message}
                id="description"
                label={
                  <>
                    Description{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </>
                }
              >
                <textarea
                  aria-describedby={errors.description ? "description-error" : undefined}
                  aria-invalid={Boolean(errors.description)}
                  className={adminTextareaClassName}
                  id="description"
                  placeholder="Tell people what makes it good."
                  {...form.register("description")}
                />
              </FormField>
            </div>
          </section>

          <section aria-labelledby="media-heading" className="rounded-lg border bg-background">
            <div className="border-b px-5 py-4">
              <h2 className="font-bold text-lg" id="media-heading">
                Media
              </h2>
              <p className="text-muted-foreground text-xs">
                Uploads work before the product exists. The first image is the storefront cover.
              </p>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {stagedImages.map((image, index) => (
                  <figure
                    className="overflow-hidden rounded-lg border bg-background"
                    key={image.objectKey}
                  >
                    <div className="relative aspect-square bg-muted">
                      <Image
                        alt={image.alt || image.fileName}
                        className="h-full w-full object-contain object-center"
                        fill
                        sizes="(min-width: 640px) 33vw, 100vw"
                        src={image.previewUrl}
                        unoptimized
                      />
                      {index === 0 ? (
                        <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground text-xs">
                          Cover
                        </span>
                      ) : null}
                    </div>
                    <figcaption className="space-y-2 border-t p-2.5">
                      <Input
                        aria-label={`Alt text for ${image.fileName}`}
                        className="h-9"
                        maxLength={180}
                        onChange={(event) =>
                          setStagedImages((current) =>
                            current.map((staged) =>
                              staged.objectKey === image.objectKey
                                ? { ...staged, alt: event.target.value }
                                : staged,
                            ),
                          )
                        }
                        placeholder="Alt text"
                        value={image.alt}
                      />
                      <div className="flex justify-end">
                        <Button
                          disabled={busy}
                          onClick={() => removeStagedImage(image.objectKey)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Trash2 aria-hidden="true" />
                          Remove
                          <span className="sr-only"> {image.fileName}</span>
                        </Button>
                      </div>
                    </figcaption>
                  </figure>
                ))}

                {/* biome-ignore lint/a11y/noStaticElementInteractions: drag/paste
                    affordances only; the button inside remains the accessible path. */}
                <div
                  className="flex aspect-square flex-col"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void stageFile(event.dataTransfer.files?.[0]);
                  }}
                  onPaste={(event) => void stageFile(event.clipboardData.files?.[0])}
                >
                  <button
                    className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-4 text-center text-muted-foreground outline-none transition hover:border-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!r2Configured || busy}
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <ImagePlus aria-hidden="true" className="size-6" />
                    <span className="font-semibold text-sm">
                      {isUploading ? "Uploading…" : "Add image"}
                    </span>
                    <span className="text-xs">
                      Drop, paste, or browse. JPEG, PNG, WebP, or AVIF up to{" "}
                      {MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.
                    </span>
                  </button>
                  <input
                    accept={allowedProductImageTypes.join(",")}
                    className="sr-only"
                    onChange={(event) => void stageFile(event.target.files?.[0])}
                    ref={fileInputRef}
                    tabIndex={-1}
                    type="file"
                  />
                </div>
              </div>

              {!r2Configured ? (
                <p className="text-amber-800 text-sm" role="status">
                  Configure all R2 environment values and restart the dev server to enable uploads.
                </p>
              ) : null}
              {uploadError ? (
                <p className="text-destructive text-sm" role="alert">
                  {uploadError}
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="variants-heading"
            className="overflow-hidden rounded-lg border bg-background"
          >
            <div className="border-b px-5 py-4">
              <h2 className="font-bold text-lg" id="variants-heading">
                Variants &amp; pricing
              </h2>
              <p className="text-muted-foreground text-xs">
                Every product needs at least one variant to be sellable. Prices are in CAD.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Variants for the new product</caption>
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
                      Name
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
                      SKU
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
                      Price (CAD)
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 font-semibold" scope="col">
                      On hand
                    </th>
                    <th className="w-14 px-4 py-3" scope="col">
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {variantRows.fields.map((field, index) => {
                    const rowErrors = errors.variants?.[index];

                    return (
                      <tr className="align-top" key={field.id}>
                        <td className="min-w-28 px-4 py-2.5">
                          <ComposerCell error={rowErrors?.name?.message} id={`${field.id}-name`}>
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
                          </ComposerCell>
                        </td>
                        <td className="min-w-32 px-4 py-2.5">
                          <ComposerCell error={rowErrors?.sku?.message} id={`${field.id}-sku`}>
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
                          </ComposerCell>
                        </td>
                        <td className="min-w-28 px-4 py-2.5">
                          <ComposerCell error={rowErrors?.price?.message} id={`${field.id}-price`}>
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
                          </ComposerCell>
                        </td>
                        <td className="min-w-20 px-4 py-2.5">
                          <ComposerCell
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
                          </ComposerCell>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <Button
                            disabled={busy}
                            onClick={() => variantRows.remove(index)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            Remove
                            <span className="sr-only"> variant {index + 1}</span>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-2 border-t px-5 py-3">
              <Button
                disabled={busy}
                onClick={() => variantRows.append(emptyVariantRow)}
                size="sm"
                type="button"
                variant="outline"
              >
                <Plus aria-hidden="true" />
                Add another variant
              </Button>
              {errors.variants?.message ? (
                <p className="text-destructive text-sm" role="alert">
                  {errors.variants.message}
                </p>
              ) : null}
            </div>
          </section>
        </div>

        {/* ===== Right rail ===== */}
        <div className="space-y-4">
          <section aria-labelledby="checklist-heading" className="rounded-lg border bg-background">
            <div className="border-b px-4 py-3.5">
              <h2 className="font-bold text-base" id="checklist-heading">
                Ready to publish?
              </h2>
            </div>
            <ul className="space-y-2.5 p-4 text-sm">
              {checklist.map((item) => (
                <li
                  className={
                    item.done
                      ? "flex items-center gap-2.5"
                      : "flex items-center gap-2.5 text-muted-foreground"
                  }
                  key={item.label}
                >
                  {item.done ? (
                    <Check aria-hidden="true" className="size-4 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  {item.label}
                  <span className="sr-only">{item.done ? " — done" : " — not done"}</span>
                </li>
              ))}
            </ul>
            <div className="border-t p-4">
              <p className="text-muted-foreground text-xs">
                Publishing makes the product visible on the storefront immediately. You can always
                start as a draft instead.
              </p>
            </div>
          </section>
        </div>
      </div>

      {/* ===== Sticky create bar ===== */}
      <div className="sticky bottom-4 z-30 mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-surface-chrome px-4 py-3 text-white shadow-lg">
          <p className="min-w-0 text-sm text-white/70">
            {actionError ? (
              <span className="text-red-300" role="alert">
                {actionError}
              </span>
            ) : (
              "Nothing is public until you publish."
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              asChild
              className="text-white/80 hover:bg-white/10 hover:text-white"
              size="sm"
              variant="ghost"
            >
              <Link href={"/admin/products" as Route} prefetch={false}>
                Cancel
              </Link>
            </Button>
            <Button
              className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
              disabled={busy}
              onClick={() => submitWithIntent("draft")}
              size="sm"
              type="button"
              variant="outline"
            >
              {pendingIntent === "draft" ? "Saving…" : "Save as draft"}
            </Button>
            <Button
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={busy}
              onClick={() => submitWithIntent("publish")}
              size="sm"
              type="button"
            >
              {pendingIntent === "publish" ? "Publishing…" : "Create & publish"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ComposerCell({
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

function buildChecklist({
  name,
  slug,
  category,
  subcategory,
  shippingProfile,
  variants,
  imageCount,
}: {
  name: string;
  slug: string;
  category: string;
  subcategory: string;
  shippingProfile: string;
  variants: ReadonlyArray<{ name: string; sku: string; price: string; inventory: string }>;
  imageCount: number;
}) {
  const completeVariants = variants.filter(
    (row) => adminVariantFormSchema.safeParse(row).success,
  ).length;

  return [
    { label: "Name and slug", done: Boolean(name.trim() && slug.trim()) },
    {
      label: "Category, subcategory, and shipping profile chosen",
      done: category !== "" && subcategory !== "" && shippingProfile !== "",
    },
    {
      label:
        completeVariants === 1
          ? "1 variant with price and inventory"
          : `${completeVariants} variants with price and inventory`,
      done: completeVariants > 0,
    },
    {
      label:
        imageCount === 0
          ? "No images yet (optional)"
          : imageCount === 1
            ? "1 image uploaded"
            : `${imageCount} images uploaded`,
      done: imageCount > 0,
    },
  ];
}
