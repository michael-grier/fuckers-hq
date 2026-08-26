"use client";

import { ImagePlus } from "lucide-react";
import type { RefObject } from "react";

import { allowedProductImageTypes, MAX_PRODUCT_IMAGE_BYTES } from "@/lib/r2/upload-contract";
import { cn } from "@/lib/utils";

type ProductImagePickerProps = {
  disabled: boolean;
  helpId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  isUploading: boolean;
  matchGridRow?: boolean;
  onFile: (file: File | undefined) => void | Promise<void>;
};

/**
 * Presents the same native image picker on new and existing products. The
 * input covers the tile so mobile browsers open their picker directly, while
 * the wrapper retains drag-and-drop and paste support on larger screens.
 */
export function ProductImagePicker({
  disabled,
  helpId,
  inputRef,
  isUploading,
  matchGridRow = false,
  onFile,
}: ProductImagePickerProps) {
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag/paste affordances only; the native file input remains the accessible path. */}
      <div
        className={cn(
          "relative flex min-h-72 self-stretch flex-col sm:min-h-0",
          // An aspect ratio can prevent grid stretch, so drop it beside image cards.
          !matchGridRow && "sm:aspect-square",
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          void onFile(event.dataTransfer.files?.[0]);
        }}
        onPaste={(event) => void onFile(event.clipboardData.files?.[0])}
      >
        <input
          accept={allowedProductImageTypes.join(",")}
          aria-describedby={helpId}
          aria-label="Choose a product photo"
          className="peer absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          disabled={disabled}
          onChange={(event) => void onFile(event.target.files?.[0])}
          ref={inputRef}
          type="file"
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-background px-4 text-center text-muted-foreground transition peer-hover:border-accent peer-hover:text-foreground peer-disabled:cursor-not-allowed peer-disabled:opacity-50 peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50">
          <ImagePlus aria-hidden="true" className="size-6" />
          <span className="font-semibold text-base">
            {isUploading ? "Uploading…" : "Add a product photo"}
          </span>
          <span className="text-xs" id={helpId}>
            JPEG, PNG, WebP, or AVIF up to {MAX_PRODUCT_IMAGE_BYTES / 1024 / 1024} MB.
          </span>
          <span className="mt-3 inline-flex h-11 items-center rounded-md bg-accent px-5 font-semibold text-accent-foreground text-sm">
            Choose photo
          </span>
          <span className="mt-1 hidden text-xs sm:block">
            You can also drop or paste an image here.
          </span>
        </div>
      </div>
    </>
  );
}
