import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import type { OrderEmailKind } from "@/lib/db/schema";
import type { OrderEmailAttemptResult, OrderEmailRef } from "@/lib/email/order-email-delivery";
import { retryOrderEmailSchema } from "@/lib/validators/admin";

type RetryOrderEmailDependencies = {
  authorize: () => Promise<unknown>;
  attempt: (ref: OrderEmailRef) => Promise<OrderEmailAttemptResult>;
  reportError: (error: unknown) => void;
};

const emailLabels: Record<OrderEmailKind, string> = {
  confirmation: "Confirmation",
  delivery_scheduled: "Delivery notification",
  refund: "Refund notification",
  shipped: "Shipping notification",
  shipping_payment_request: "Shipping payment request",
};

export async function retryOrderEmailForAdmin(
  input: unknown,
  dependencies: RetryOrderEmailDependencies,
): Promise<ActionResult> {
  await dependencies.authorize();

  const parsed = retryOrderEmailSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  let result: OrderEmailAttemptResult;

  try {
    result = await dependencies.attempt(parsed.data);
  } catch (error) {
    dependencies.reportError(error);
    throw error;
  }

  if (result.status === "failed") {
    dependencies.reportError(result.error);
    const label = emailLabels[parsed.data.kind];

    return {
      success: false,
      message: result.terminal
        ? `${label} delivery failed and needs another manual retry.`
        : `${label} delivery failed and was scheduled to retry.`,
    };
  }

  return {
    success: true,
    data: undefined,
  };
}
