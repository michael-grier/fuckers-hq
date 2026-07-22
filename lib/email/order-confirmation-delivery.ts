export const ORDER_CONFIRMATION_MAX_ATTEMPTS = 8;
export const ORDER_CONFIRMATION_LEASE_MS = 10 * 60 * 1_000;
const ORDER_CONFIRMATION_RETRY_BASE_MS = 5 * 60 * 1_000;
const ORDER_CONFIRMATION_RETRY_MAX_MS = 6 * 60 * 60 * 1_000;

export type OrderConfirmationDeliveryClaim = {
  id: string;
  orderId: string;
  idempotencyKey: string;
  attemptCount: number;
};

export type ClaimOrderConfirmationDeliveryOptions = {
  force: boolean;
  now: Date;
  leaseUntil: Date;
};

export type CompleteOrderConfirmationDelivery = {
  deliveryId: string;
  attemptCount: number;
  providerMessageId: string;
  deliveredAt: Date;
};

export type FailOrderConfirmationDelivery = {
  deliveryId: string;
  attemptCount: number;
  errorCode: string;
  failedAt: Date;
  nextAttemptAt: Date;
  terminal: boolean;
};

export type OrderConfirmationDeliveryRepository = {
  claimDelivery: (
    orderId: string,
    options: ClaimOrderConfirmationDeliveryOptions,
  ) => Promise<OrderConfirmationDeliveryClaim | null>;
  markDelivered: (delivery: CompleteOrderConfirmationDelivery) => Promise<boolean>;
  markFailed: (delivery: FailOrderConfirmationDelivery) => Promise<boolean>;
  findDueOrderIds: (now: Date, limit: number) => Promise<string[]>;
};

export type OrderConfirmationSender = (orderId: string, idempotencyKey: string) => Promise<string>;

export type OrderConfirmationAttemptResult =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "superseded" }
  | { status: "failed"; error: unknown; terminal: boolean };

type AttemptOrderConfirmationOptions = {
  force?: boolean;
  now?: Date;
  maxAttempts?: number;
};

export function makeOrderConfirmationIdempotencyKey(orderId: string): string {
  return `order-confirmation/${orderId}`;
}

export function getOrderConfirmationRetryAt(attemptCount: number, failedAt: Date): Date {
  const exponent = Math.max(0, attemptCount - 1);
  const delay = Math.min(
    ORDER_CONFIRMATION_RETRY_BASE_MS * 2 ** exponent,
    ORDER_CONFIRMATION_RETRY_MAX_MS,
  );

  return new Date(failedAt.getTime() + delay);
}

export function getOrderConfirmationErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^(RESEND_API_KEY|EMAIL_FROM|SUPPORT_EMAIL) is required\.$/.test(error.message)
  ) {
    return "configuration_error";
  }

  if (error instanceof Error && error.name === "OrderConfirmationDeliveryError") {
    return "provider_error";
  }

  return "delivery_error";
}

export async function attemptOrderConfirmationDelivery(
  orderId: string,
  repository: OrderConfirmationDeliveryRepository,
  send: OrderConfirmationSender,
  options: AttemptOrderConfirmationOptions = {},
): Promise<OrderConfirmationAttemptResult> {
  const now = options.now ?? new Date();
  const claim = await repository.claimDelivery(orderId, {
    force: options.force ?? false,
    now,
    leaseUntil: new Date(now.getTime() + ORDER_CONFIRMATION_LEASE_MS),
  });

  if (!claim) {
    return { status: "skipped" };
  }

  try {
    const providerMessageId = await send(claim.orderId, claim.idempotencyKey);
    const recorded = await repository.markDelivered({
      deliveryId: claim.id,
      attemptCount: claim.attemptCount,
      providerMessageId,
      deliveredAt: now,
    });

    return recorded ? { status: "sent" } : { status: "superseded" };
  } catch (error) {
    const terminal = claim.attemptCount >= (options.maxAttempts ?? ORDER_CONFIRMATION_MAX_ATTEMPTS);
    const recorded = await repository.markFailed({
      deliveryId: claim.id,
      attemptCount: claim.attemptCount,
      errorCode: getOrderConfirmationErrorCode(error),
      failedAt: now,
      nextAttemptAt: getOrderConfirmationRetryAt(claim.attemptCount, now),
      terminal,
    });

    if (!recorded) {
      return { status: "superseded" };
    }

    return { status: "failed", error, terminal };
  }
}

export type DeliverDueOrderConfirmationsResult = {
  attempted: number;
  sent: number;
  failed: number;
};

export async function deliverDueOrderConfirmations(
  repository: OrderConfirmationDeliveryRepository,
  send: OrderConfirmationSender,
  options: { now?: Date; limit?: number; reportError?: (error: unknown) => void } = {},
): Promise<DeliverDueOrderConfirmationsResult> {
  const now = options.now ?? new Date();
  const orderIds = await repository.findDueOrderIds(now, options.limit ?? 20);
  const result: DeliverDueOrderConfirmationsResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
  };

  for (const orderId of orderIds) {
    const attempt = await attemptOrderConfirmationDelivery(orderId, repository, send, { now });

    if (attempt.status === "sent") {
      result.attempted += 1;
      result.sent += 1;
    } else if (attempt.status === "failed") {
      result.attempted += 1;
      result.failed += 1;
      options.reportError?.(attempt.error);
    }
  }

  return result;
}
