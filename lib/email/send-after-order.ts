import type { OrderEmailAttemptResult, OrderEmailRef } from "@/lib/email/order-email-delivery";
import type { StripeWebhookResult } from "@/lib/webhooks/stripe";

type OrderEmailAttempt = (ref: OrderEmailRef) => Promise<OrderEmailAttemptResult>;
type EmailErrorReporter = (error: unknown) => void;

export async function sendConfirmationAfterOrderCommit(
  result: StripeWebhookResult,
  attemptConfirmation: OrderEmailAttempt,
  reportError: EmailErrorReporter,
): Promise<boolean> {
  if (!result.handled || !("created" in result)) {
    return false;
  }

  try {
    const attempt = await attemptConfirmation({ orderId: result.orderId, kind: "confirmation" });

    if (attempt.status === "failed") {
      reportError(attempt.error);
    }

    return attempt.status === "sent";
  } catch (error) {
    reportError(error);
    return false;
  }
}
