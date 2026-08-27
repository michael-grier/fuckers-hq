import { z } from "zod";

import { normalizeDeliveryUnit, parseDeliveryStreetAddress } from "@/lib/checkout/delivery-address";
import { cartSchema } from "@/lib/validators/cart";

const canadianPostalCodePattern = /^[A-Z]\d[A-Z]\d[A-Z]\d$/;

export const deliveryAddressSchema = z
  .object({
    line1: z.string().trim().min(3).max(120),
    unit: z.string().trim().max(32).optional(),
    postalCode: z
      .string()
      .trim()
      .transform((value) => value.replace(/[\s-]/g, "").toUpperCase())
      .pipe(z.string().regex(canadianPostalCodePattern, "Enter a valid Canadian postal code.")),
  })
  .strict()
  .transform(({ line1, unit, postalCode }) => {
    const parsedStreet = parseDeliveryStreetAddress(line1);
    const normalizedUnit = unit ? normalizeDeliveryUnit(unit) : parsedStreet.unit;

    return {
      line1: parsedStreet.line1,
      ...(normalizedUnit ? { unit: normalizedUnit } : {}),
      postalCode,
    };
  })
  .refine((address) => address.line1.length >= 3, {
    message: "Enter a valid street address.",
    path: ["line1"],
  });

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
