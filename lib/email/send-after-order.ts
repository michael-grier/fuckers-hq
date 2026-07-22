import type { OrderConfirmationAttemptResult } from "@/lib/email/order-confirmation-delivery";
import type { StripeWebhookResult } from "@/lib/webhooks/stripe";

type OrderConfirmationAttempt = (orderId: string) => Promise<OrderConfirmationAttemptResult>;
type EmailErrorReporter = (error: unknown) => void;

export async function sendConfirmationAfterOrderCommit(
  result: StripeWebhookResult,
  attemptConfirmation: OrderConfirmationAttempt,
  reportError: EmailErrorReporter,
): Promise<boolean> {
  if (!result.handled || !("created" in result)) {
    return false;
  }

  try {
    const attempt = await attemptConfirmation(result.orderId);

    if (attempt.status === "failed") {
      reportError(attempt.error);
    }

    return attempt.status === "sent";
  } catch (error) {
    reportError(error);
    return false;
  }
}
