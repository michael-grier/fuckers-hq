import { z } from "zod";

import { orderEmailKindValues } from "@/lib/db/schema";

export const adminEntityIdSchema = z.string().uuid();

export const markOrderShippedSchema = z
  .object({
    orderId: adminEntityIdSchema,
  })
  .strict();

export const retryOrderInventoryAllocationSchema = markOrderShippedSchema;

export const retryOrderEmailSchema = z
  .object({
    orderId: adminEntityIdSchema,
    kind: z.enum(orderEmailKindValues),
  })
  .strict();
