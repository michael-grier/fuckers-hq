import { z } from "zod";

export const adminEntityIdSchema = z.string().uuid();

export const markOrderShippedSchema = z
  .object({
    orderId: adminEntityIdSchema,
  })
  .strict();

export const retryOrderInventoryAllocationSchema = markOrderShippedSchema;
export const retryOrderConfirmationSchema = markOrderShippedSchema;
