"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import { requireAdmin } from "@/lib/auth/require-admin";
import { attemptOrderEmailDelivery } from "@/lib/email/order-email-delivery";
import { orderEmailDeliveryRepository } from "@/lib/email/order-email-delivery-repository";
import { retryOrderEmailForAdmin } from "@/lib/email/retry-order-email";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { captureServerException } from "@/lib/observability/server";
import { adminOrderRepository } from "@/lib/orders/admin-order-repository";
import {
  applyOrderFulfillmentTransition,
  OrderFulfillmentError,
  type OrderFulfillmentTransition,
} from "@/lib/orders/order-fulfillment";
import {
  InventoryExceptionResolutionError,
  resolveInventoryException,
} from "@/lib/orders/resolve-inventory-exception";
import {
  markOrderShippedSchema,
  retryOrderEmailSchema,
  retryOrderInventoryAllocationSchema,
} from "@/lib/validators/admin";

async function runFulfillmentTransition(
  input: unknown,
  transition: OrderFulfillmentTransition,
  operation: string,
  afterCommit?: (orderId: string) => Promise<void>,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = markOrderShippedSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    await applyOrderFulfillmentTransition(parsed.data.orderId, transition, adminOrderRepository);
  } catch (error) {
    if (error instanceof OrderFulfillmentError) {
      return {
        success: false,
        message: error.message,
      };
    }

    captureServerException(error, { area: "admin", operation });
    throw error;
  }

  // Runs only after the status commit, so a notification failure cannot undo the transition.
  await afterCommit?.(parsed.data.orderId);

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/pickups");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);

  return {
    success: true,
    data: undefined,
  };
}

export async function markOrderAsShipped(input: unknown): Promise<ActionResult> {
  return runFulfillmentTransition(input, "ship", "admin.mark-order-shipped");
}

export async function markOrderReadyForPickup(input: unknown): Promise<ActionResult> {
  return runFulfillmentTransition(
    input,
    "ready_for_pickup",
    "admin.mark-order-ready-for-pickup",
    async (orderId) => {
      // The outbox row was written inside the transition, so a failure here only defers the email
      // to the retry cron. It must never turn a completed transition into an error.
      try {
        const attempt = await attemptOrderEmailDelivery(
          { orderId, kind: "pickup_ready" },
          orderEmailDeliveryRepository,
          sendOrderEmail,
        );

        if (attempt.status === "failed") {
          captureServerException(attempt.error, {
            area: "email",
            operation: "email.pickup-ready",
          });
        }
      } catch (error) {
        captureServerException(error, { area: "email", operation: "email.pickup-ready" });
      }
    },
  );
}

export async function markOrderPickedUp(input: unknown): Promise<ActionResult> {
  return runFulfillmentTransition(input, "picked_up", "admin.mark-order-picked-up");
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

export async function retryOrderEmail(input: unknown): Promise<ActionResult> {
  const result = await retryOrderEmailForAdmin(input, {
    authorize: requireAdmin,
    attempt: (ref) =>
      attemptOrderEmailDelivery(ref, orderEmailDeliveryRepository, sendOrderEmail, {
        force: true,
      }),
    reportError: (error) => {
      captureServerException(error, {
        area: "admin",
        operation: "admin.retry-order-email",
      });
    },
  });

  if (result.success) {
    revalidatePath("/admin/orders");

    const parsed = retryOrderEmailSchema.safeParse(input);

    if (parsed.success) {
      revalidatePath(`/admin/orders/${parsed.data.orderId}`);
    }
  }

  return result;
}
