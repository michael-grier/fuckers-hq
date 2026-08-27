import "server-only";

import { asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { orderItems, orders, productVariants } from "@/lib/db/schema";
import type { OrderInventoryReturnResult } from "@/lib/orders/return-order-inventory";

const postgresIntegerMax = 2_147_483_647;
type OrderInventoryTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Moves one refunded order from allocated to released and restores every surviving variant. */
export async function returnOrderItemsToStock(
  tx: OrderInventoryTransaction,
  orderId: string,
): Promise<OrderInventoryReturnResult> {
  const [order] = await tx
    .select({
      inventoryStatus: orders.inventoryStatus,
      refundStatus: orders.refundStatus,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .for("update");

  if (!order) {
    return "not_found";
  }

  if (order.inventoryStatus === "released") {
    return "already_returned";
  }

  if (order.refundStatus === "none" || order.inventoryStatus !== "allocated") {
    return "invalid_status";
  }

  const items = await tx
    .select({ variantId: orderItems.variantId, quantity: orderItems.quantity })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const quantitiesByVariant = new Map<string, number>();

  for (const item of items) {
    if (!item.variantId) {
      return "inventory_unavailable";
    }

    quantitiesByVariant.set(
      item.variantId,
      (quantitiesByVariant.get(item.variantId) ?? 0) + item.quantity,
    );
  }

  if (quantitiesByVariant.size === 0) {
    return "inventory_unavailable";
  }

  const variantIds = [...quantitiesByVariant.keys()].sort();
  const variants = await tx
    .select({ id: productVariants.id, inventoryQty: productVariants.inventoryQty })
    .from(productVariants)
    .where(inArray(productVariants.id, variantIds))
    .orderBy(asc(productVariants.id))
    .for("update");

  // Preflight every locked row before writing any of them, so a deleted variant or integer
  // overflow leaves the whole order allocated for an operator instead of partially restocked.
  if (
    variants.length !== variantIds.length ||
    variants.some(
      (variant) =>
        variant.inventoryQty > postgresIntegerMax - (quantitiesByVariant.get(variant.id) ?? 0),
    )
  ) {
    return "inventory_unavailable";
  }

  for (const variant of variants) {
    const quantity = quantitiesByVariant.get(variant.id);

    if (!quantity) {
      throw new Error("A locked return variant is missing its order quantity.");
    }

    await tx
      .update(productVariants)
      .set({ inventoryQty: sql`${productVariants.inventoryQty} + ${quantity}` })
      .where(eq(productVariants.id, variant.id));
  }

  const returnedOrders = await tx
    .update(orders)
    .set({ inventoryStatus: "released" })
    .where(eq(orders.id, orderId))
    .returning({ id: orders.id });

  if (returnedOrders.length !== 1) {
    throw new Error("A refunded order could not be marked inventory released.");
  }

  return "returned";
}
