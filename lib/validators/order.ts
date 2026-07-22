import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

import {
  confirmationDeliveryStatusValues,
  disputeStatusValues,
  orderConfirmationDeliveries,
  orderInventoryStatusValues,
  orderItems,
  orderStatusValues,
  orders,
  refundStatusValues,
} from "@/lib/db/schema";

export const orderStatusSchema = z.enum(orderStatusValues);
export const orderInventoryStatusSchema = z.enum(orderInventoryStatusValues);
export const refundStatusSchema = z.enum(refundStatusValues);
export const disputeStatusSchema = z.enum(disputeStatusValues);
export const confirmationDeliveryStatusSchema = z.enum(confirmationDeliveryStatusValues);
export const shippingAddressSchema = z.record(z.string(), z.unknown()).nullable();

export const orderSelectSchema = createSelectSchema(orders, {
  shippingAddress: shippingAddressSchema,
});

export const orderInsertSchema = createInsertSchema(orders, {
  email: (schema) => schema.email(),
  refundStatus: refundStatusSchema,
  refundedCents: (schema) => schema.int().nonnegative(),
  disputeStatus: disputeStatusSchema,
  subtotalCents: (schema) => schema.int().nonnegative(),
  taxCents: (schema) => schema.int().nonnegative(),
  shippingCents: (schema) => schema.int().nonnegative(),
  totalCents: (schema) => schema.int().nonnegative(),
  currency: (schema) => schema.length(3).toLowerCase(),
  shippingAddress: shippingAddressSchema,
})
  .omit({
    id: true,
    createdAt: true,
  })
  .refine((order) => (order.refundedCents ?? 0) <= order.totalCents, {
    message: "Refunded amount cannot exceed the order total.",
    path: ["refundedCents"],
  });

export const orderUpdateSchema = createUpdateSchema(orders, {
  status: orderStatusSchema,
}).pick({
  status: true,
});

export const orderItemSelectSchema = createSelectSchema(orderItems);
export const orderConfirmationDeliverySelectSchema = createSelectSchema(
  orderConfirmationDeliveries,
  {
    status: confirmationDeliveryStatusSchema,
    attemptCount: (schema) => schema.int().nonnegative(),
  },
);

export const orderItemInsertSchema = createInsertSchema(orderItems, {
  productNameSnapshot: (schema) => schema.trim().min(1).max(160),
  variantNameSnapshot: (schema) => schema.trim().min(1).max(120),
  unitPriceCentsSnapshot: (schema) => schema.int().nonnegative(),
  quantity: (schema) => schema.int().positive(),
}).omit({
  id: true,
});

export type OrderInsert = z.infer<typeof orderInsertSchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;
export type OrderItemInsert = z.infer<typeof orderItemInsertSchema>;
