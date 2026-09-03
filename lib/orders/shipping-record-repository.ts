import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { orders } from "@/lib/db/schema";

export type ShippingRecordValues = Pick<
  typeof orders.$inferSelect,
  | "shippingActualCostCents"
  | "shippingActualCostUnknown"
  | "packedWeightGrams"
  | "packedWeightUnknown"
>;

export type SaveShippingRecordResult = "saved" | "not_found" | "not_shipping";

/** Saves operator-entered label cost and packed weight only on orders fulfilled by shipping. */
export async function saveOrderShippingRecord(
  orderId: string,
  values: ShippingRecordValues,
): Promise<SaveShippingRecordResult> {
  const updated = await getDb()
    .update(orders)
    .set(values)
    .where(and(eq(orders.id, orderId), eq(orders.fulfillmentMethod, "shipping")))
    .returning({ id: orders.id });

  if (updated.length === 1) {
    return "saved";
  }

  const order = await getDb().query.orders.findFirst({
    columns: { id: true },
    where: (orders, { eq }) => eq(orders.id, orderId),
  });

  return order ? "not_shipping" : "not_found";
}
