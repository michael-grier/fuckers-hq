import { z } from "zod";

import { orderEmailKindValues } from "@/lib/db/schema";
import {
  getShippingCarrierTrackingNumberError,
  newShipmentCarrierValues,
} from "@/lib/orders/shipping-carriers";

export const adminEntityIdSchema = z.string().uuid();

/** Shared shape for admin order actions that need nothing but the order to act on. */
export const adminOrderIdSchema = z
  .object({
    orderId: adminEntityIdSchema,
  })
  .strict();

export const retryOrderInventoryAllocationSchema = adminOrderIdSchema;
export const returnOrderInventorySchema = adminOrderIdSchema;

/**
 * Carrier tracking numbers are alphanumeric with spaces or hyphens as separators. Constraining the
 * shape keeps an operator-supplied value from carrying markup, a URL, or a header break into the
 * customer's email, where it is rendered.
 */
const trackingNumberPattern = /^[A-Za-z0-9][A-Za-z0-9 -]*$/;

const blankToUndefined = (value: unknown) => {
  if (typeof value === "string") {
    // Collapsed so a number pasted with stray whitespace is stored in one canonical form.
    return value.trim().replace(/\s+/g, " ") || undefined;
  }

  return value ?? undefined;
};

export const markOrderShippedSchema = z
  .object({
    orderId: adminEntityIdSchema,
    trackingCarrier: z.preprocess(blankToUndefined, z.enum(newShipmentCarrierValues).optional()),
    trackingNumber: z.preprocess(
      blankToUndefined,
      z
        .string()
        .max(64)
        .regex(trackingNumberPattern, "Enter a tracking number using letters, numbers, or hyphens.")
        .optional(),
    ),
  })
  .strict()
  // Tracking is optional, but a number without a carrier cannot be turned into a tracking link and
  // a carrier without a number tells the customer nothing.
  .refine(
    (value) => (value.trackingCarrier === undefined) === (value.trackingNumber === undefined),
    {
      message: "Choose a carrier and enter its tracking number, or leave both blank.",
      path: ["trackingNumber"],
    },
  )
  .superRefine((value, context) => {
    if (!value.trackingCarrier || !value.trackingNumber) {
      return;
    }

    const formatError = getShippingCarrierTrackingNumberError(
      value.trackingCarrier,
      value.trackingNumber,
    );

    if (formatError) {
      context.addIssue({ code: "custom", message: formatError, path: ["trackingNumber"] });
    }
  });

export const retryOrderEmailSchema = z
  .object({
    orderId: adminEntityIdSchema,
    kind: z.enum(orderEmailKindValues),
  })
  .strict();
