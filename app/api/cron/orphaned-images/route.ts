import { isCronAuthorized } from "@/lib/cron/authorization";
import { getDb } from "@/lib/db/client";
import { productImages } from "@/lib/db/schema";
import { env, requireEnv } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";
import { deleteProductImageObject, isR2Configured, listProductImageObjects } from "@/lib/r2";
import { reapOrphanedProductImages } from "@/lib/r2/orphan-reconciliation";

export const runtime = "nodejs";

// Reaps R2 objects orphaned by best-effort delete failures or abandoned
// composer uploads. See lib/r2/orphan-reconciliation.ts for the rules.
export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  if (!isR2Configured()) {
    return Response.json({ skipped: "R2 is not configured." });
  }

  try {
    const db = getDb();
    const result = await reapOrphanedProductImages({
      listObjects: listProductImageObjects,
      listReferencedImageUrls: async () => {
        const rows = await db.select({ url: productImages.url }).from(productImages);
        return rows.map((row) => row.url);
      },
      deleteObject: deleteProductImageObject,
      publicBaseUrl: requireEnv("R2_PUBLIC_URL"),
      now: new Date(),
      reportError: (error) => {
        captureServerException(error, {
          area: "r2",
          operation: "r2.reap-orphaned-image",
        });
      },
    });

    return Response.json(result);
  } catch (error) {
    captureServerException(error, {
      area: "r2",
      operation: "r2.reconcile-orphaned-images",
    });
    return new Response("Orphaned image reconciliation failed.", { status: 500 });
  }
}
