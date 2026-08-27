import { z } from "zod";

import { cartSchema } from "@/lib/validators/cart";

const canadianPostalCodePattern = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

export const deliveryAddressSchema = z
  .object({
    line1: z.string().trim().min(3).max(120),
    postalCode: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
      .pipe(z.string().regex(canadianPostalCodePattern, "Enter a valid Canadian postal code.")),
  })
  .strict();

export const deliveryEligibilityRequestSchema = z
  .object({
    items: cartSchema,
    address: deliveryAddressSchema,
  })
  .strict();

const deliveryEligibilityMessageSchema = z.string().min(1);

export const deliveryEligibilityResponseSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("eligible"),
      token: z.string().min(1),
      address: deliveryAddressSchema,
      reviewRequired: z.boolean(),
      message: deliveryEligibilityMessageSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("below_minimum"),
      subtotalCents: z.number().int().nonnegative(),
      minimumCents: z.number().int().positive(),
      message: deliveryEligibilityMessageSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("ineligible"),
      message: deliveryEligibilityMessageSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      message: deliveryEligibilityMessageSchema,
    })
    .strict(),
]);

export type DeliveryAddress = z.infer<typeof deliveryAddressSchema>;
export type DeliveryEligibilityRequest = z.infer<typeof deliveryEligibilityRequestSchema>;
export type DeliveryEligibilityResponse = z.infer<typeof deliveryEligibilityResponseSchema>;
