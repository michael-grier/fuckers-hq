import type { OrderEmailAttemptResult, OrderEmailRef } from "@/lib/email/order-email-delivery";
import type { StripeWebhookResult } from "@/lib/webhooks/stripe";

type OrderEmailAttempt = (ref: OrderEmailRef) => Promise<OrderEmailAttemptResult>;
type EmailErrorReporter = (error: unknown) => void;

/** Attempts every email committed by this paid-order or refund result. */
export async function sendOrderEmailsAfterCommit(
  result: StripeWebhookResult,
  attemptEmail: OrderEmailAttempt,
  reportError: EmailErrorReporter,
): Promise<boolean> {
  if (!result.handled) {
    return false;
  }

  const refs: OrderEmailRef[] = [];

  if ("created" in result) {
    refs.push({ orderId: result.orderId, kind: "confirmation" });
    refs.push({ orderId: result.orderId, kind: "admin_new_order" });
  }

  if (
    "refundEmailDeliveryId" in result &&
    typeof result.refundEmailDeliveryId === "string" &&
    typeof result.orderId === "string"
  ) {
    refs.push({
      orderId: result.orderId,
      kind: "refund",
      deliveryId: result.refundEmailDeliveryId,
    });
  }

  let sent = false;

  for (const ref of refs) {
    try {
      const attempt = await attemptEmail(ref);

      if (attempt.status === "failed") {
        reportError(attempt.error);
      }

      sent ||= attempt.status === "sent";
    } catch (error) {
      reportError(error);
    }
  }

  return sent;
}
