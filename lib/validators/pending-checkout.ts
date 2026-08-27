import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

import { MAX_CART_LINE_QUANTITY, MAX_CART_LINES } from "@/lib/cart/constants";
import { shippingProfileValues } from "@/lib/catalog/shipping-profiles";
import { pendingCheckouts } from "@/lib/db/schema";
import { cartSchema, pendingCheckoutTokenSchema } from "@/lib/validators/cart";
import { deliveryAddressSchema } from "@/lib/validators/delivery";

export const pendingCheckoutLineSnapshotSchema = z
  .object({
    variantId: z.string().uuid(),
    productName: z.string().trim().min(1).max(160),
    variantName: z.string().trim().min(1).max(120),
    unitPriceCents: z.number().int().nonnegative(),
    quantity: z.number().int().positive().max(MAX_CART_LINE_QUANTITY),
    currency: z
      .string()
      .length(3)
      .regex(/^[a-z]{3}$/),
    // Optional so a verified payment for a Checkout Session created before migration 0013 can
    // still become an order. New reservations always write these immutable shipping fields.
    shippingProfile: z.enum(shippingProfileValues).optional(),
    shippingRateCents: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    (line) => (line.shippingProfile === undefined) === (line.shippingRateCents === undefined),
    "Shipping profile and rate snapshots must be stored together.",
  );

export const pendingCheckoutLineSnapshotsSchema = z
  .array(pendingCheckoutLineSnapshotSchema)
  .min(1)
  .max(MAX_CART_LINES)
  .superRefine((lines, context) => {
    const variantIds = new Set<string>();

    for (const [index, line] of lines.entries()) {
      if (variantIds.has(line.variantId)) {
        context.addIssue({
          code: "custom",
          message: "Each variant must have exactly one immutable line snapshot.",
          path: [index, "variantId"],
        });
      }

      variantIds.add(line.variantId);
    }
  });

export const pendingCheckoutSelectSchema = createSelectSchema(pendingCheckouts, {
  token: pendingCheckoutTokenSchema,
  items: cartSchema,
  lineItems: pendingCheckoutLineSnapshotsSchema.nullable(),
  deliveryAddressCheck: deliveryAddressSchema.nullable(),
});

export const pendingCheckoutInsertSchema = createInsertSchema(pendingCheckouts, {
  token: pendingCheckoutTokenSchema,
  items: cartSchema,
  deliveryAddressCheck: deliveryAddressSchema.nullable().optional(),
})
  .omit({
    id: true,
    createdAt: true,
    completedAt: true,
    lineItems: true,
  })
  .extend({
    lineItems: pendingCheckoutLineSnapshotsSchema,
  });

export const pendingCheckoutUpdateSchema = createUpdateSchema(pendingCheckouts, {
  token: pendingCheckoutTokenSchema,
  items: cartSchema,
}).omit({
  id: true,
  token: true,
  items: true,
  lineItems: true,
  createdAt: true,
  expiresAt: true,
});

export type PendingCheckoutInsert = z.infer<typeof pendingCheckoutInsertSchema>;
export type PendingCheckoutUpdate = z.infer<typeof pendingCheckoutUpdateSchema>;
