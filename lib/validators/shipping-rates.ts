import { z } from "zod";

import { shippingProfileValues } from "@/lib/catalog/shipping-profiles";
import { dollarsToCents } from "@/lib/money";

const postgresIntegerMax = 2_147_483_647;

/** Validates a rate entered in dollars before it crosses the persistence boundary. */
const shippingRateDollarsSchema = z
  .string()
  .trim()
  .min(1, "Rate is required.")
  .superRefine((value, context) => {
    try {
      if (dollarsToCents(value) > postgresIntegerMax) {
        context.addIssue({ code: "custom", message: "Rate is too large." });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Use a non-negative dollar amount with no more than two decimals.",
      });
    }
  });

export const adminShippingRatesFormSchema = z
  .object({
    deck: shippingRateDollarsSchema,
    softgood: shippingRateDollarsSchema,
    flat: shippingRateDollarsSchema,
  })
  .strict();

export type AdminShippingRatesFormInput = z.infer<typeof adminShippingRatesFormSchema>;

/** Converts the complete admin form into the canonical profile order used for writes. */
export function toShippingRateMutationValues(input: AdminShippingRatesFormInput) {
  return shippingProfileValues.map((profile) => ({
    profile,
    rateCents: dollarsToCents(input[profile]),
  }));
}
