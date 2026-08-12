import { describe, expect, test } from "bun:test";
import {
  ORPHAN_GRACE_MS,
  type OrphanedImageReaperDependencies,
  reapOrphanedProductImages,
} from "@/lib/r2/orphan-reconciliation";

const publicBaseUrl = "https://images.example.com";
const now = new Date("2026-08-12T12:00:00Z");
const pastGrace = new Date(now.getTime() - ORPHAN_GRACE_MS - 1);
const withinGrace = new Date(now.getTime() - ORPHAN_GRACE_MS + 60_000);

const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";
const referencedKey = `products/${productId}/34b62019-8c2f-4b83-9144-f60c96eb17da-deck.webp`;
const orphanKey = `products/${productId}/7935da4e-5a60-42e4-b3f3-3a57c956a352-old.jpg`;

function makeDeps(
  overrides: Partial<OrphanedImageReaperDependencies>,
): OrphanedImageReaperDependencies & { deletedKeys: string[]; reportedErrors: unknown[] } {
  const deletedKeys: string[] = [];
  const reportedErrors: unknown[] = [];

  return {
    listObjects: async () => [],
    listReferencedImageUrls: async () => [],
    deleteObject: async (key) => {
      deletedKeys.push(key);
    },
    publicBaseUrl,
    now,
    reportError: (error) => {
      reportedErrors.push(error);
    },
    ...overrides,
    deletedKeys,
    reportedErrors,
  };
}

describe("reapOrphanedProductImages", () => {
  test("deletes unreferenced objects past the grace window and keeps referenced ones", async () => {
    const deps = makeDeps({
      listObjects: async () => [
        { key: referencedKey, lastModified: pastGrace },
        { key: orphanKey, lastModified: pastGrace },
      ],
      listReferencedImageUrls: async () => [`${publicBaseUrl}/${referencedKey}`],
    });

    const result = await reapOrphanedProductImages(deps);

    expect(deps.deletedKeys).toEqual([orphanKey]);
    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 0 });
  });

  test("keeps unreferenced objects inside the grace window or without a timestamp", async () => {
    const deps = makeDeps({
      listObjects: async () => [
        { key: orphanKey, lastModified: withinGrace },
        { key: referencedKey, lastModified: undefined },
      ],
    });

    const result = await reapOrphanedProductImages(deps);

    expect(deps.deletedKeys).toEqual([]);
    expect(result).toEqual({ scanned: 2, deleted: 0, failed: 0 });
  });

  test("reports a failed delete and continues with the remaining orphans", async () => {
    const failure = new Error("r2 unavailable");
    const deps = makeDeps({
      listObjects: async () => [
        { key: orphanKey, lastModified: pastGrace },
        { key: referencedKey, lastModified: pastGrace },
      ],
      deleteObject: async (key) => {
        if (key === orphanKey) {
          throw failure;
        }
        deps.deletedKeys.push(key);
      },
    });

    const result = await reapOrphanedProductImages(deps);

    expect(deps.reportedErrors).toEqual([failure]);
    expect(deps.deletedKeys).toEqual([referencedKey]);
    expect(result).toEqual({ scanned: 2, deleted: 1, failed: 1 });
  });

  test("refuses to delete anything when a referenced URL does not match the public base URL", async () => {
    const deps = makeDeps({
      listObjects: async () => [{ key: orphanKey, lastModified: pastGrace }],
      listReferencedImageUrls: async () => ["https://other-host.example.com/products/x.jpg"],
    });

    await expect(reapOrphanedProductImages(deps)).rejects.toThrow("refusing to reap orphans");
    expect(deps.deletedKeys).toEqual([]);
  });
});
