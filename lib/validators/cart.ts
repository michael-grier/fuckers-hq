import { z } from "zod";

import { MAX_CART_LINE_QUANTITY, MAX_CART_LINES } from "@/lib/cart/constants";
import { fulfillmentMethodValues } from "@/lib/db/schema";

export const fulfillmentMethodSchema = z.enum(fulfillmentMethodValues);

export const cartLineSchema = z
  .object({
    variantId: z.string().uuid(),
    quantity: z.number().int().positive().max(MAX_CART_LINE_QUANTITY),
  })
  .strict();

/**
 * Shape of a cart line as persisted to localStorage, which is untrusted input on hydration:
 * `CartDisplayLine` is compile-time only, so this schema is what actually guards the store against
 * structurally invalid payloads (partial writes, other scripts on the key, stale shapes). The
 * checkout constraints from `cartLineSchema` are inherited; the display fields are added on top.
 *
 * Breaking changes to this schema or `persistedCartStateSchema` silently drop carts already
 * persisted in shoppers' browsers — follow the versioning playbook on `createCartStorage` in
 * `lib/cart/store.ts` first. Additive `.optional()`/`.nullish()` fields are safe.
 */
export const persistedCartLineSchema = cartLineSchema.extend({
  productName: z.string(),
  variantName: z.string(),
  priceCents: z.number().int().nonnegative(),
  imageUrl: z.string().nullish(),
});

/** The `partialize`d cart state the store writes to localStorage. */
export const persistedCartStateSchema = z
  .object({
    lines: z.array(persistedCartLineSchema),
    fulfillmentMethod: fulfillmentMethodSchema,
  })
  .strict();

export const cartSchema = z
  .array(cartLineSchema)
  .min(1)
  .max(MAX_CART_LINES)
  .superRefine((lines, context) => {
    const quantities = new Map<string, number>();

    for (const [index, line] of lines.entries()) {
      const quantity = (quantities.get(line.variantId) ?? 0) + line.quantity;
      quantities.set(line.variantId, quantity);

      if (quantity > MAX_CART_LINE_QUANTITY) {
        context.addIssue({
          code: "custom",
          message: `Combined quantity cannot exceed ${MAX_CART_LINE_QUANTITY}.`,
          path: [index, "quantity"],
        });
      }
    }
  });

export const checkoutSchema = z
  .object({
    requestId: z.string().uuid(),
    items: cartSchema,
    // Absent means shipping so a client that predates local pickup keeps working unchanged.
    fulfillmentMethod: fulfillmentMethodSchema.default("shipping"),
  })
  .strict();

export const checkoutResponseSchema = z
  .object({
    url: z.string().url(),
  })
  .strict();

export const checkoutErrorResponseSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();

export const pendingCheckoutTokenSchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

/**
 * Unknown keys pass through deliberately. A Session created by a newer deploy can be paid while an
 * older instance is still receiving webhooks, so rejecting an unrecognized metadata key would
 * discard a verified payment and leave Stripe retrying against a permanent failure. Only the keys
 * named here are ever read, and the signature check — not this schema — is what establishes trust.
 */
export const pendingCheckoutMetadataSchema = z
  .object({
    pendingCheckoutToken: pendingCheckoutTokenSchema,
    reservationToken: pendingCheckoutTokenSchema.optional(),
    // Present for Stripe dashboard triage only. The pending checkout row stays authoritative for
    // how an order is fulfilled, because Session metadata is echoed back from an external system.
    fulfillmentMethod: fulfillmentMethodSchema.optional(),
  })
  .passthrough();

export type CartLine = z.infer<typeof cartLineSchema>;
export type FulfillmentMethodInput = z.infer<typeof fulfillmentMethodSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;
export type PendingCheckoutMetadata = z.infer<typeof pendingCheckoutMetadataSchema>;
