"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { ConfirmButton } from "@/components/admin/confirm-button";
import { FormField } from "@/components/admin/form-field";
import { MoveButtons } from "@/components/admin/move-buttons";
import { ProductImagePicker } from "@/components/admin/product-image-picker";
import { ReorderableList } from "@/components/admin/reorderable-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createProductImage,
  deleteProductImage,
  moveProductImage,
  updateProductImage,
} from "@/lib/actions/images";
import type { ActionFailure } from "@/lib/actions/result";
import { uploadProductImageFile } from "@/lib/admin/product-image-upload";
import { moveVariantInList, type VariantMoveDirection } from "@/lib/admin/variant-order";
import { productImageUploadRequestSchema } from "@/lib/r2/upload-contract";
import {
  type AdminProductImageFormInput,
  adminProductImageFormSchema,
} from "@/lib/validators/product";

type ManagedProductImage = {
  id: string;
  url: string;
  alt: string | null;
  position: number;
};

type ProductMediaPanelProps = {
  images: ManagedProductImage[];
  productId: string;
  productName: string;
  r2Configured: boolean;
};

/**
 * The Media panel of the product workspace: upload (browse, drop, or paste),
 * arrow-based reordering with the first image as the storefront cover, inline
 * alt editing, and deletion. Ordering is owned by the move action — there is
 * no hand-typed position field.
 */
export function ProductMediaPanel({
  images,
  productId,
  productName,
  r2Configured,
}: ProductMediaPanelProps) {
  const router = useRouter();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState("");
  const [, startTransition] = useTransition();
  const [optimisticImages, applyOptimisticMove] = useOptimistic(
    images,
    (current: ManagedProductImage[], move: { imageId: string; direction: VariantMoveDirection }) =>
      moveVariantInList(current, move.imageId, move.direction) ?? current,
  );

  function handleMove(imageId: string, direction: VariantMoveDirection) {
    setMoveError(null);

    const reordered = moveVariantInList(optimisticImages, imageId, direction);
    const movedIndex = reordered?.findIndex((image) => image.id === imageId) ?? -1;
    const movedImage = movedIndex >= 0 ? reordered?.[movedIndex] : undefined;

    startTransition(async () => {
      applyOptimisticMove({ imageId, direction });

      if (movedImage && reordered) {
        setMoveAnnouncement(
          `${describeImage(movedImage, movedIndex)} moved to position ${movedIndex + 1} of ${reordered.length}.`,
        );
      }

      try {
        const result = await moveProductImage({ productId, imageId, direction });

        if (!result.success) {
          // React drops the optimistic order when the transition ends, so the
          // list snaps back to the server order on failure. Clear the optimistic
          // announcement too, or the live region keeps claiming a move that was
          // rejected; the alert below carries the reason.
          setMoveAnnouncement("");
          setMoveError(result.message);
          return;
        }

        router.refresh();
      } catch {
        // The action rethrows after reporting to Sentry, so without this the
        // rejection would surface nowhere and the arrows would look inert.
        setMoveAnnouncement("");
        setMoveError("The image could not be moved. Try again shortly.");
      }
    });
  }

  return (
    <section aria-labelledby="media-heading" className="rounded-lg border bg-background">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-bold text-lg" id="media-heading">
            Media
          </h2>
          <p className="text-muted-foreground text-xs">
            The first image is the storefront cover. Use the arrows to reorder.
          </p>
        </div>
        <p className="text-muted-foreground text-sm">
          {optimisticImages.length} {optimisticImages.length === 1 ? "image" : "images"}
        </p>
      </div>

      <div className="space-y-4 p-5">
        <ReorderableList className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {optimisticImages.map((image, index) => (
            <ProductImageCard
              canMoveDown={index < optimisticImages.length - 1}
              canMoveUp={index > 0}
              image={image}
              index={index}
              isCover={index === 0}
              key={image.id}
              onMove={(direction) => handleMove(image.id, direction)}
              productId={productId}
              productName={productName}
            />
          ))}
          <ImageUploader
            matchGridRow={optimisticImages.length > 0}
            productId={productId}
            r2Configured={r2Configured}
          />
        </ReorderableList>

        {moveError ? (
          <p className="text-destructive text-sm" role="alert">
            {moveError}
          </p>
        ) : null}
        <p aria-live="polite" className="sr-only">
          {moveAnnouncement}
        </p>
      </div>
    </section>
  );
}

function describeImage(image: ManagedProductImage, index: number): string {
  return image.alt || `Image ${index + 1}`;
}

function ImageUploader({
  matchGridRow,
  productId,
  r2Configured,
}: {
  matchGridRow: boolean;
  productId: string;
  r2Configured: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function addFile(file: File | undefined) {
    if (!file || !r2Configured || isUploading) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);

    const uploadRequest = productImageUploadRequestSchema.safeParse({
      productId,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
    });

    if (!uploadRequest.success) {
      setActionError("Use a JPEG, PNG, WebP, or AVIF image no larger than 5 MB.");
      return;
    }

    setIsUploading(true);

    try {
      const uploaded = await uploadProductImageFile(uploadRequest.data, file);

      if (!uploaded.success) {
        setActionError(uploaded.error);
        return;
      }

      const result = await createProductImage({
        productId,
        objectKey: uploaded.objectKey,
        alt: "",
      });

      if (!result.success) {
        setActionError(result.message);
        return;
      }

      setSuccessMessage("Image added.");
      router.refresh();
    } catch {
      setActionError("Image upload failed. Check the R2 configuration and try again.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  return (
    <>
      <ProductImagePicker
        disabled={!r2Configured || isUploading}
        helpId="existing-product-image-help"
        inputRef={fileInputRef}
        isUploading={isUploading}
        matchGridRow={matchGridRow}
        onFile={addFile}
      />
      {!r2Configured || actionError || successMessage ? (
        <div className="col-span-full space-y-1">
          {!r2Configured ? (
            <p className="text-amber-800 text-sm" role="status">
              Configure all R2 environment values and restart the dev server to enable uploads.
            </p>
          ) : null}
          {actionError ? (
            <p className="text-destructive text-sm" role="alert">
              {actionError}
            </p>
          ) : null}
          {successMessage ? (
            <p className="text-sm" role="status">
              {successMessage}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function ProductImageCard({
  canMoveDown,
  canMoveUp,
  image,
  index,
  isCover,
  onMove,
  productId,
  productName,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  image: ManagedProductImage;
  index: number;
  isCover: boolean;
  onMove: (direction: VariantMoveDirection) => void;
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const form = useForm<AdminProductImageFormInput>({
    defaultValues: { alt: image.alt ?? "" },
    resolver: zodResolver(adminProductImageFormSchema),
  });

  async function onSubmit(values: AdminProductImageFormInput) {
    setActionError(null);
    setSuccessMessage(null);

    const result = await updateProductImage({
      productId,
      imageId: image.id,
      ...values,
    });

    if (!result.success) {
      showFormFailure(result, form.setError, ["alt"]);
      setActionError(result.message);
      return;
    }

    form.reset(values);
    setSuccessMessage("Saved.");
    router.refresh();
  }

  async function onDelete() {
    setActionError(null);
    setSuccessMessage(null);
    setIsDeleting(true);

    try {
      const result = await deleteProductImage({ productId, imageId: image.id });

      if (!result.success) {
        setActionError(result.message);
        return;
      }

      router.refresh();
    } finally {
      setIsDeleting(false);
    }
  }

  const busy = form.formState.isSubmitting || isDeleting;

  return (
    <div className="overflow-hidden rounded-lg border bg-background" data-reorder-key={image.id}>
      <div className="relative aspect-square bg-muted">
        <Image
          alt={image.alt ?? productName}
          className="h-full w-full object-contain object-center"
          fill
          sizes="(min-width: 1280px) 20rem, (min-width: 640px) 50vw, 100vw"
          src={image.url}
          unoptimized
        />
        {isCover ? (
          <span className="absolute top-2 left-2 rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground text-xs">
            Cover
          </span>
        ) : null}
      </div>

      <form className="space-y-3 border-t p-3" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FormField
          error={form.formState.errors.alt?.message}
          id={`${image.id}-alt`}
          label="Alt text"
        >
          <Input
            aria-describedby={form.formState.errors.alt ? `${image.id}-alt-error` : undefined}
            aria-invalid={Boolean(form.formState.errors.alt)}
            disabled={busy}
            id={`${image.id}-alt`}
            {...form.register("alt")}
          />
        </FormField>

        {actionError ? (
          <p className="text-destructive text-sm" role="alert">
            {actionError}
          </p>
        ) : null}
        {successMessage ? (
          <p className="text-sm" role="status">
            {successMessage}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <MoveButtons
            canMoveDown={canMoveDown}
            canMoveUp={canMoveUp}
            disabled={busy}
            itemLabel={describeImage(image, index)}
            onMove={onMove}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <ConfirmButton
              confirmLabel="Yes, delete"
              confirmMessage="This cannot be undone."
              disabled={busy}
              onConfirm={() => void onDelete()}
              size="sm"
              variant="destructive"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </ConfirmButton>
            <Button disabled={busy || !form.formState.isDirty} size="sm" type="submit">
              {form.formState.isSubmitting ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function showFormFailure<TField extends string>(
  result: ActionFailure,
  setError: (field: TField, error: { message: string; type: "server" }) => void,
  fields: readonly TField[],
) {
  for (const field of fields) {
    const message = result.fieldErrors?.[field]?.[0];

    if (message) {
      setError(field, { message, type: "server" });
    }
  }
}
