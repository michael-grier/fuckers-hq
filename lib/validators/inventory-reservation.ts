import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

import {
  inventoryReservationItems,
  inventoryReservationStatusValues,
  inventoryReservations,
} from "@/lib/db/schema";
import { pendingCheckoutTokenSchema } from "@/lib/validators/cart";

export const inventoryReservationStatusSchema = z.enum(inventoryReservationStatusValues);

export const inventoryReservationSelectSchema = createSelectSchema(inventoryReservations, {
  token: pendingCheckoutTokenSchema,
  status: inventoryReservationStatusSchema,
  stripeSessionParams: z.record(z.string(), z.unknown()).nullable(),
});

export const inventoryReservationInsertSchema = createInsertSchema(inventoryReservations, {
  token: pendingCheckoutTokenSchema,
  status: inventoryReservationStatusSchema,
  stripeSessionParams: z.record(z.string(), z.unknown()).nullable(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  convertedAt: true,
  releasedAt: true,
  releaseReason: true,
  reconcileLeaseUntil: true,
  reconcileAttemptCount: true,
  lastReconcileErrorCode: true,
});

export const inventoryReservationUpdateSchema = createUpdateSchema(inventoryReservations, {
  status: inventoryReservationStatusSchema,
  stripeSessionParams: z.record(z.string(), z.unknown()).nullable(),
}).omit({
  id: true,
  token: true,
  requestId: true,
  pendingCheckoutId: true,
  stripeCreateIdempotencyKey: true,
  createdAt: true,
});

export const inventoryReservationItemSelectSchema = createSelectSchema(inventoryReservationItems, {
  quantity: (schema) => schema.int().positive(),
});

export const inventoryReservationItemInsertSchema = createInsertSchema(inventoryReservationItems, {
  quantity: (schema) => schema.int().positive(),
}).omit({
  id: true,
});
