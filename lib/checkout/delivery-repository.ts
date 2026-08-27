import "server-only";

import { eq, inArray } from "drizzle-orm";

import {
  combineCartLines,
  getCheckoutSubtotalCents,
  resolveCheckoutLines,
} from "@/lib/checkout/items";
import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { products, productVariants } from "@/lib/db/schema";
import type { CartLine } from "@/lib/validators/cart";

/** Resolves current catalog prices and availability without reserving inventory. */
export async function getDeliveryCartSubtotalCents(
  items: CartLine[],
  database: Database = getDb(),
): Promise<number> {
  const combinedItems = combineCartLines(items);
  const variants = await database
    .select({
      id: productVariants.id,
      productName: products.name,
      productStatus: products.status,
      shippingProfile: products.shippingProfile,
      variantName: productVariants.name,
      priceCents: productVariants.priceCents,
      inventoryQty: productVariants.inventoryQty,
      reservedQty: productVariants.reservedQty,
    })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(
      inArray(
        productVariants.id,
        combinedItems.map((item) => item.variantId),
      ),
    );
  const resolved = resolveCheckoutLines(
    combinedItems,
    variants.map((variant) => ({ ...variant, shippingRateCents: 0 })),
  );

  return getCheckoutSubtotalCents(resolved);
}
