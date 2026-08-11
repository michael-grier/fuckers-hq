import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import {
  inventoryReservationItems,
  orderItems,
  productImages,
  products,
  productVariants,
} from "@/lib/db/schema";

export type DeleteProductRecordResult =
  | { outcome: "deleted"; slug: string; imageUrls: string[] }
  | { outcome: "not_found" }
  | { outcome: "active" }
  | { outcome: "has_commerce_history" };

/**
 * Hard-deletes a product only while it has no commerce history: no order line
 * items, no reservation items (active or audit), and no reserved inventory on
 * any of its variants. Anything that has entered checkout must be archived
 * instead, so order snapshots keep a product to point back at.
 */
export async function deleteProductRecord(
  database: Database,
  productId: string,
): Promise<DeleteProductRecordResult> {
  return database.transaction(async (tx) => {
    const [product] = await tx
      .select({ slug: products.slug, status: products.status })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");

    if (!product) {
      return { outcome: "not_found" as const };
    }

    if (product.status === "active") {
      return { outcome: "active" as const };
    }

    const [historyRow] = await tx
      .select({ variantId: productVariants.id })
      .from(productVariants)
      .where(
        and(
          eq(productVariants.productId, productId),
          sql`(
            ${productVariants.reservedQty} > 0
            or exists (
              select 1 from ${orderItems}
              where ${orderItems.variantId} = ${productVariants.id}
            )
            or exists (
              select 1 from ${inventoryReservationItems}
              where ${inventoryReservationItems.variantId} = ${productVariants.id}
            )
          )`,
        ),
      )
      .limit(1);

    if (historyRow) {
      return { outcome: "has_commerce_history" as const };
    }

    // Collected before the cascade removes the rows; the caller deletes the
    // R2 objects after commit so a failed delete never orphans the database.
    const images = await tx
      .select({ url: productImages.url })
      .from(productImages)
      .where(eq(productImages.productId, productId));

    // The row lock above does not stop a concurrent checkout from inserting a
    // reservation item between the history check and this delete. The restrict
    // FK on inventory_reservation_items.variant_id aborts the delete in that
    // race; the caller maps the 23503 to the same refusal.
    await tx.delete(products).where(eq(products.id, productId));

    return {
      outcome: "deleted" as const,
      slug: product.slug,
      imageUrls: images.map((image) => image.url),
    };
  });
}
