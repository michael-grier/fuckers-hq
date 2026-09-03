import { z } from "zod";

import { dollarsToCents } from "@/lib/money";
import { adminEntityIdSchema } from "@/lib/validators/admin";

const postgresIntegerMax = 2_147_483_647;

/** Accepts a blank pending value or a complete non-negative Canadian-dollar amount. */
const actualCostDollarsSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (value === "") {
      return;
    }

    try {
      if (dollarsToCents(value) > postgresIntegerMax) {
        context.addIssue({ code: "custom", message: "Carrier cost is too large." });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Use a non-negative dollar amount with no more than two decimals.",
      });
    }
  });

/** Accepts a blank pending value or a positive whole-gram packed weight. */
const packedWeightGramsSchema = z
  .string()
  .trim()
  .superRefine((value, context) => {
    if (value === "") {
      return;
    }

    if (!/^\d+$/.test(value)) {
      context.addIssue({ code: "custom", message: "Use a positive whole number of grams." });
      return;
    }

    const grams = Number.parseInt(value, 10);

    if (grams < 1) {
      context.addIssue({ code: "custom", message: "Packed weight must be at least 1 gram." });
    } else if (grams > postgresIntegerMax) {
      context.addIssue({ code: "custom", message: "Packed weight is too large." });
    }
  });

export const adminOrderShippingRecordSchema = z
  .object({
    orderId: adminEntityIdSchema,
    actualCostDollars: actualCostDollarsSchema,
    actualCostUnknown: z.boolean(),
    packedWeightGrams: packedWeightGramsSchema,
    packedWeightUnknown: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.actualCostUnknown && value.actualCostDollars !== "") {
      context.addIssue({
        code: "custom",
        message: "Clear the carrier cost when marking it unknown.",
        path: ["actualCostDollars"],
      });
    } else if (!value.actualCostUnknown && value.actualCostDollars === "") {
      context.addIssue({
        code: "custom",
        message: "Enter the complete carrier charge or mark it unknown.",
        path: ["actualCostDollars"],
      });
    }

    if (value.packedWeightUnknown && value.packedWeightGrams !== "") {
      context.addIssue({
        code: "custom",
        message: "Clear the packed weight when marking it unknown.",
        path: ["packedWeightGrams"],
      });
    } else if (!value.packedWeightUnknown && value.packedWeightGrams === "") {
      context.addIssue({
        code: "custom",
        message: "Enter the packed weight or mark it unknown.",
        path: ["packedWeightGrams"],
      });
    }
  });

export type AdminOrderShippingRecordInput = z.infer<typeof adminOrderShippingRecordSchema>;

/** Converts the admin form into nullable database values plus independent unknown decisions. */
export function toOrderShippingRecordValues(input: AdminOrderShippingRecordInput) {
  return {
    shippingActualCostCents: input.actualCostUnknown
      ? null
      : dollarsToCents(input.actualCostDollars),
    shippingActualCostUnknown: input.actualCostUnknown,
    packedWeightGrams: input.packedWeightUnknown
      ? null
      : Number.parseInt(input.packedWeightGrams, 10),
    packedWeightUnknown: input.packedWeightUnknown,
  };
}
