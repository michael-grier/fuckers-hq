import "server-only";

import { and, eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { productImages, products } from "@/lib/db/schema";

type DeletedProductImage = {
  slug: string;
  url: string;
};

export async function deleteProductImageRecord(
  database: Database,
  productId: string,
  imageId: string,
): Promise<DeletedProductImage | null> {
  return database.transaction(async (tx) => {
    const [image] = await tx
      .select({
        slug: products.slug,
        url: productImages.url,
      })
      .from(productImages)
      .innerJoin(products, eq(products.id, productImages.productId))
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)))
      .for("update");

    if (!image) {
      return null;
    }

    await tx
      .delete(productImages)
      .where(and(eq(productImages.id, imageId), eq(productImages.productId, productId)));

    // Keep gallery positions dense and deterministic in the same transaction as the deletion.
    await tx.execute(sql`
      with ranked_images as (
        select
          ${productImages.id} as image_id,
          cast(
            row_number() over (
              order by ${productImages.position}, ${productImages.id}
            ) - 1 as integer
          ) as next_position
        from ${productImages}
        where ${productImages.productId} = ${productId}
      )
      update ${productImages}
      set position = ranked_images.next_position
      from ranked_images
      where ${productImages.id} = ranked_images.image_id
        and ${productImages.position} <> ranked_images.next_position
    `);

    return image;
  });
}
