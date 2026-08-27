"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import { requireAdmin } from "@/lib/auth/require-admin";
import type { OrderEmailKind } from "@/lib/db/schema";
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
  type OrderShipment,
  orderFulfillmentTransitionRules,
} from "@/lib/orders/order-fulfillment";
import {
  InventoryExceptionResolutionError,
  resolveInventoryException,
} from "@/lib/orders/resolve-inventory-exception";
import {
  OrderInventoryReturnError,
  returnRefundedOrderInventory,
} from "@/lib/orders/return-order-inventory";
import {
  adminOrderIdSchema,
  markOrderShippedSchema,
  retryOrderEmailSchema,
  retryOrderInventoryAllocationSchema,
  returnOrderInventorySchema,
} from "@/lib/validators/admin";

/** One stable Sentry operation per email kind, so dashboards can query each notification. */
const fulfillmentEmailOperations: Record<OrderEmailKind, string> = {
  confirmation: "email.confirmation",
  delivery_scheduled: "email.delivery-scheduled",
  shipped: "email.shipped",
};

/**
 * Delivers the notification a committed transition owes.
 *
 * The outbox row was written inside the transition, so a failure here only defers the email to the
 * retry cron. It must never turn a completed transition into an error.
 */
async function deliverQueuedFulfillmentEmail(orderId: string, kind: OrderEmailKind): Promise<void> {
  const operation = fulfillmentEmailOperations[kind];

  try {
    const attempt = await attemptOrderEmailDelivery(
      { orderId, kind },
      orderEmailDeliveryRepository,
      sendOrderEmail,
    );

    if (attempt.status === "failed") {
      captureServerException(attempt.error, { area: "email", operation });
    }
  } catch (error) {
    captureServerException(error, { area: "email", operation });
  }
}

type FulfillmentTransitionRequest = {
  orderId: string;
  transition: OrderFulfillmentTransition;
  operation: string;
  shipment?: OrderShipment | null;
};

/** Applies one fulfillment step. Callers authorize and validate the request before calling. */
async function runFulfillmentTransition(
  request: FulfillmentTransitionRequest,
): Promise<ActionResult> {
  try {
    await applyOrderFulfillmentTransition(
      request.orderId,
      request.transition,
      adminOrderRepository,
      { shipment: request.shipment },
    );
  } catch (error) {
    if (error instanceof OrderFulfillmentError) {
      return {
        success: false,
        message: error.message,
      };
    }

    captureServerException(error, { area: "admin", operation: request.operation });
    throw error;
  }

  const queuedEmailKind = orderFulfillmentTransitionRules[request.transition].queuedEmailKind;

  if (queuedEmailKind) {
    // Runs only after the status commit, so a notification failure cannot undo the transition.
    await deliverQueuedFulfillmentEmail(request.orderId, queuedEmailKind);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/deliveries");
  revalidatePath(`/admin/orders/${request.orderId}`);

  return {
    success: true,
    data: undefined,
  };
}

/** Shared entry point for the fulfillment steps whose only input is the order to advance. */
async function runOrderIdTransition(
  input: unknown,
  transition: OrderFulfillmentTransition,
  operation: string,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminOrderIdSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  return runFulfillmentTransition({ orderId: parsed.data.orderId, transition, operation });
}

export async function markOrderAsShipped(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = markOrderShippedSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const { orderId, trackingCarrier, trackingNumber } = parsed.data;

  return runFulfillmentTransition({
    orderId,
    transition: "ship",
    operation: "admin.mark-order-shipped",
    // The schema already rejects a half-filled pair; this narrows it for the domain type.
    shipment:
      trackingCarrier && trackingNumber ? { carrier: trackingCarrier, trackingNumber } : null,
  });
}

export async function scheduleOrderDelivery(input: unknown): Promise<ActionResult> {
  return runOrderIdTransition(input, "schedule_delivery", "admin.schedule-order-delivery");
}

export async function markOrderDelivered(input: unknown): Promise<ActionResult> {
  return runOrderIdTransition(input, "delivered", "admin.mark-order-delivered");
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

/** Returns every allocated unit on one refunded order to sellable stock. */
export async function returnOrderInventoryToStock(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = returnOrderInventorySchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    await returnRefundedOrderInventory(parsed.data.orderId, adminOrderRepository);
  } catch (error) {
    if (error instanceof OrderInventoryReturnError) {
      return {
        success: false,
        message: error.message,
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.return-order-inventory",
    });
    throw error;
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/deliveries");
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
