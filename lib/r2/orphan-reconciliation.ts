import { getR2ObjectKeyFromPublicUrl } from "@/lib/r2/upload-contract";

// Objects younger than this are never reaped, so an in-flight composer upload
// cannot be deleted before its product_images row is claimed.
export const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export type OrphanedImageReaperDependencies = {
  listObjects: () => Promise<{ key: string; lastModified: Date | undefined }[]>;
  listReferencedImageUrls: () => Promise<string[]>;
  deleteObject: (objectKey: string) => Promise<void>;
  publicBaseUrl: string;
  now: Date;
  reportError: (error: unknown) => void;
};

export type ReapOrphanedProductImagesResult = {
  scanned: number;
  deleted: number;
  failed: number;
};

/**
 * Deletes bucket objects under the product-image prefix that no
 * product_images row references and that are older than the grace window.
 * Idempotent and safe to rerun: a failed delete is reported and left for the
 * next run.
 *
 * Aborts without deleting anything if a referenced URL cannot be mapped back
 * to an object key. All stored URLs are built from the configured public base
 * URL, so an unmappable one means the base URL drifted since upload — and
 * every still-referenced object would then look orphaned.
 */
export async function reapOrphanedProductImages(
  deps: OrphanedImageReaperDependencies,
): Promise<ReapOrphanedProductImagesResult> {
  const referencedUrls = await deps.listReferencedImageUrls();
  const referencedKeys = new Set<string>();

  for (const url of referencedUrls) {
    const key = getR2ObjectKeyFromPublicUrl(deps.publicBaseUrl, url);

    if (key === null) {
      throw new Error(
        "Referenced product image URL does not match the configured R2 public base URL; refusing to reap orphans.",
      );
    }

    referencedKeys.add(key);
  }

  const objects = await deps.listObjects();
  const reapBefore = new Date(deps.now.getTime() - ORPHAN_GRACE_MS);
  let deleted = 0;
  let failed = 0;

  for (const object of objects) {
    // A missing timestamp gives no proof the object is past the grace window,
    // so treat it as too young rather than risk reaping an in-flight upload.
    if (
      referencedKeys.has(object.key) ||
      !object.lastModified ||
      object.lastModified > reapBefore
    ) {
      continue;
    }

    try {
      await deps.deleteObject(object.key);
      deleted += 1;
    } catch (error) {
      deps.reportError(error);
      failed += 1;
    }
  }

  return { scanned: objects.length, deleted, failed };
}
