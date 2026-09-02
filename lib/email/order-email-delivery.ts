import type { OrderEmailKind } from "@/lib/db/schema";

export const ORDER_EMAIL_MAX_ATTEMPTS = 8;
export const ORDER_EMAIL_LEASE_MS = 10 * 60 * 1_000;
const ORDER_EMAIL_RETRY_BASE_MS = 5 * 60 * 1_000;
const ORDER_EMAIL_RETRY_MAX_MS = 6 * 60 * 60 * 1_000;

export type SingletonOrderEmailKind = Exclude<OrderEmailKind, "refund">;

/** Identifies one outbox row. Refunds carry the row id because an order can have several. */
export type OrderEmailRef = {
  orderId: string;
  kind: OrderEmailKind;
  deliveryId?: string;
};

export type OrderEmailDeliveryClaim = OrderEmailRef & {
  id: string;
  idempotencyKey: string;
  attemptCount: number;
};

export type ClaimOrderEmailDeliveryOptions = {
  force: boolean;
  now: Date;
  leaseUntil: Date;
};

export type CompleteOrderEmailDelivery = {
  deliveryId: string;
  attemptCount: number;
  providerMessageId: string;
  deliveredAt: Date;
};

export type FailOrderEmailDelivery = {
  deliveryId: string;
  attemptCount: number;
  errorCode: string;
  failedAt: Date;
  nextAttemptAt: Date;
  terminal: boolean;
};

export type OrderEmailDeliveryRepository = {
  claimDelivery: (
    ref: OrderEmailRef,
    options: ClaimOrderEmailDeliveryOptions,
  ) => Promise<OrderEmailDeliveryClaim | null>;
  markDelivered: (delivery: CompleteOrderEmailDelivery) => Promise<boolean>;
  markFailed: (delivery: FailOrderEmailDelivery) => Promise<boolean>;
  findDueDeliveries: (now: Date, limit: number) => Promise<OrderEmailRef[]>;
};

export type OrderEmailSender = (ref: OrderEmailRef, idempotencyKey: string) => Promise<string>;

export type OrderEmailAttemptResult =
  | { status: "sent" }
  | { status: "skipped" }
  | { status: "superseded" }
  | { status: "failed"; error: unknown; terminal: boolean };

type AttemptOrderEmailOptions = {
  force?: boolean;
  now?: Date;
  maxAttempts?: number;
};

/**
 * Every prefix here is load-bearing history: changing one would make Resend treat an already-sent
 * email as new. Confirmation in particular keeps the prefix used before this outbox carried more
 * than one kind.
 */
const orderEmailIdempotencyPrefixes: Record<SingletonOrderEmailKind, string> = {
  admin_new_order: "admin-new-order",
  confirmation: "order-confirmation",
  delivery_scheduled: "order-delivery-scheduled",
  shipped: "order-shipped",
  shipping_payment_request: "order-shipping-payment",
};

export function makeOrderEmailIdempotencyKey(
  orderId: string,
  kind: SingletonOrderEmailKind,
): string {
  return `${orderEmailIdempotencyPrefixes[kind]}/${orderId}`;
}

/** One provider key per cumulative refund milestone, stable across webhook and delivery retries. */
export function makeRefundEmailIdempotencyKey(
  orderId: string,
  refundCumulativeCents: number,
): string {
  return `order-refund/${orderId}/${refundCumulativeCents}`;
}

export function getOrderEmailRetryAt(attemptCount: number, failedAt: Date): Date {
  const exponent = Math.max(0, attemptCount - 1);
  const delay = Math.min(ORDER_EMAIL_RETRY_BASE_MS * 2 ** exponent, ORDER_EMAIL_RETRY_MAX_MS);

  return new Date(failedAt.getTime() + delay);
}

export function getOrderEmailErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    /^(RESEND_API_KEY|EMAIL_FROM|ADMIN_ORDER_EMAIL|SUPPORT_EMAIL) is required\.$/.test(
      error.message,
    )
  ) {
    return "configuration_error";
  }

  if (error instanceof Error && error.name === "OrderEmailDeliveryError") {
    return "provider_error";
  }

  return "delivery_error";
}

export async function attemptOrderEmailDelivery(
  ref: OrderEmailRef,
  repository: OrderEmailDeliveryRepository,
  send: OrderEmailSender,
  options: AttemptOrderEmailOptions = {},
): Promise<OrderEmailAttemptResult> {
  const now = options.now ?? new Date();
  const claim = await repository.claimDelivery(ref, {
    force: options.force ?? false,
    now,
    leaseUntil: new Date(now.getTime() + ORDER_EMAIL_LEASE_MS),
  });

  if (!claim) {
    return { status: "skipped" };
  }

  try {
    const providerMessageId = await send(
      { orderId: claim.orderId, kind: claim.kind, deliveryId: claim.id },
      claim.idempotencyKey,
    );
    const recorded = await repository.markDelivered({
      deliveryId: claim.id,
      attemptCount: claim.attemptCount,
      providerMessageId,
      deliveredAt: now,
    });

    return recorded ? { status: "sent" } : { status: "superseded" };
  } catch (error) {
    const terminal = claim.attemptCount >= (options.maxAttempts ?? ORDER_EMAIL_MAX_ATTEMPTS);
    const recorded = await repository.markFailed({
      deliveryId: claim.id,
      attemptCount: claim.attemptCount,
      errorCode: getOrderEmailErrorCode(error),
      failedAt: now,
      nextAttemptAt: getOrderEmailRetryAt(claim.attemptCount, now),
      terminal,
    });

    if (!recorded) {
      return { status: "superseded" };
    }

    return { status: "failed", error, terminal };
  }
}

export type DeliverDueOrderEmailsResult = {
  attempted: number;
  sent: number;
  failed: number;
};

export async function deliverDueOrderEmails(
  repository: OrderEmailDeliveryRepository,
  send: OrderEmailSender,
  options: { now?: Date; limit?: number; reportError?: (error: unknown) => void } = {},
): Promise<DeliverDueOrderEmailsResult> {
  const now = options.now ?? new Date();
  const refs = await repository.findDueDeliveries(now, options.limit ?? 20);
  const result: DeliverDueOrderEmailsResult = {
    attempted: 0,
    sent: 0,
    failed: 0,
  };

  for (const ref of refs) {
    const attempt = await attemptOrderEmailDelivery(ref, repository, send, { now });

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
