import {
  type ProductImageUploadRequest,
  productImageUploadResponseSchema,
} from "@/lib/r2/upload-contract";

export type UploadedProductImage =
  | { success: true; objectKey: string }
  | { success: false; error: string };

/**
 * Browser-side half of the image upload contract: presigns via the admin
 * upload endpoint, then PUTs the file straight to R2. The returned object key
 * is worthless until a server action claims and re-verifies it, so a failure
 * after this step leaves at most an orphaned object.
 */
export async function uploadProductImageFile(
  request: ProductImageUploadRequest,
  file: File,
): Promise<UploadedProductImage> {
  const presignResponse = await fetch("/api/admin/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const presignBody: unknown = await presignResponse.json();

  if (!presignResponse.ok) {
    return {
      success: false,
      error: getApiError(presignBody, "Unable to prepare the image upload."),
    };
  }

  const presignedUpload = productImageUploadResponseSchema.safeParse(presignBody);

  if (!presignedUpload.success) {
    return { success: false, error: "The upload service returned an invalid response." };
  }

  const uploadResponse = await fetch(presignedUpload.data.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": request.contentType },
    body: file,
  });

  if (!uploadResponse.ok) {
    return { success: false, error: "The browser could not upload the image to R2." };
  }

  return { success: true, objectKey: presignedUpload.data.objectKey };
}

function getApiError(input: unknown, fallback: string): string {
  if (typeof input === "object" && input !== null && "error" in input) {
    const error = input.error;
    return typeof error === "string" ? error : fallback;
  }

  return fallback;
}
