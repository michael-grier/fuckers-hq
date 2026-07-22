"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import { requireAdmin } from "@/lib/auth/require-admin";
import { attemptOrderConfirmationDelivery } from "@/lib/email/order-confirmation-delivery";
import { orderConfirmationDeliveryRepository } from "@/lib/email/order-confirmation-delivery-repository";
import { retryOrderConfirmationForAdmin } from "@/lib/email/retry-order-confirmation";
import { sendOrderConfirmation } from "@/lib/email/send-order-confirmation";
import { captureServerException } from "@/lib/observability/server";
import { adminOrderRepository } from "@/lib/orders/admin-order-repository";
import { markOrderShipped, OrderFulfillmentError } from "@/lib/orders/mark-order-shipped";
import {
  InventoryExceptionResolutionError,
  resolveInventoryException,
} from "@/lib/orders/resolve-inventory-exception";
import {
  markOrderShippedSchema,
  retryOrderConfirmationSchema,
  retryOrderInventoryAllocationSchema,
} from "@/lib/validators/admin";

export async function markOrderAsShipped(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = markOrderShippedSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    await markOrderShipped(parsed.data.orderId, adminOrderRepository);
  } catch (error) {
    if (error instanceof OrderFulfillmentError) {
      return {
        success: false,
        message: error.message,
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.mark-order-shipped",
    });
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);

  return {
    success: true,
    data: undefined,
  };
}

export async function retryOrderInventoryAllocation(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = retryOrderInventoryAllocationSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    await resolveInventoryException(parsed.data.orderId, adminOrderRepository);
  } catch (error) {
    if (error instanceof InventoryExceptionResolutionError) {
      return {
        success: false,
        message: error.message,
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.retry-order-inventory-allocation",
    });
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);

  return {
    success: true,
    data: undefined,
  };
}

export async function retryOrderConfirmation(input: unknown): Promise<ActionResult> {
  const result = await retryOrderConfirmationForAdmin(input, {
    authorize: requireAdmin,
    attempt: (orderId) =>
      attemptOrderConfirmationDelivery(
        orderId,
        orderConfirmationDeliveryRepository,
        sendOrderConfirmation,
        { force: true },
      ),
    reportError: (error) => {
      captureServerException(error, {
        area: "admin",
        operation: "admin.retry-order-confirmation",
      });
    },
  });

  if (result.success) {
    revalidatePath("/admin/orders");

    const parsed = retryOrderConfirmationSchema.safeParse(input);

    if (parsed.success) {
      revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    }
  }

  return result;
}
