import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import type { OrderConfirmationAttemptResult } from "@/lib/email/order-confirmation-delivery";
import { retryOrderConfirmationSchema } from "@/lib/validators/admin";

type RetryOrderConfirmationDependencies = {
  authorize: () => Promise<unknown>;
  attempt: (orderId: string) => Promise<OrderConfirmationAttemptResult>;
  reportError: (error: unknown) => void;
};

export async function retryOrderConfirmationForAdmin(
  input: unknown,
  dependencies: RetryOrderConfirmationDependencies,
): Promise<ActionResult> {
  await dependencies.authorize();

  const parsed = retryOrderConfirmationSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  let result: OrderConfirmationAttemptResult;

  try {
    result = await dependencies.attempt(parsed.data.orderId);
  } catch (error) {
    dependencies.reportError(error);
    throw error;
  }

  if (result.status === "failed") {
    dependencies.reportError(result.error);
    return {
      success: false,
      message: result.terminal
        ? "Confirmation delivery failed and needs another manual retry."
        : "Confirmation delivery failed and was scheduled to retry.",
    };
  }

  return {
    success: true,
    data: undefined,
  };
}
