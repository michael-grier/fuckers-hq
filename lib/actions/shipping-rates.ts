"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import { saveShippingRateConfig } from "@/lib/admin/shipping-rate-repository";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db/client";
import { captureServerException } from "@/lib/observability/server";
import {
  adminShippingRatesFormSchema,
  toShippingRateMutationValues,
} from "@/lib/validators/shipping-rates";

/** Validates and persists the complete checkout rate configuration. */
export async function updateShippingRates(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminShippingRatesFormSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    await saveShippingRateConfig(getDb(), toShippingRateMutationValues(parsed.data));
    revalidatePath("/admin/shipping-rates");

    return { success: true, data: undefined };
  } catch (error) {
    captureServerException(error, {
      area: "admin",
      operation: "admin.update-shipping-rates",
    });
    throw error;
  }
}
