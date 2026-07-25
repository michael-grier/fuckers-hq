import type Stripe from "stripe";
import { z } from "zod";

import type {
  ReservationEventData,
  ReservationEventWriter,
} from "@/lib/checkout/reservation-events";
import type {
  CreatePaidOrderResult,
  PaidCheckoutData,
  PaidOrderWriter,
} from "@/lib/orders/create-paid-order";
import type {
  PaymentLifecycleUpdate,
  PaymentLifecycleWriter,
  RecordPaymentLifecycleResult,
} from "@/lib/orders/payment-lifecycle";
import { pendingCheckoutMetadataSchema } from "@/lib/validators/cart";

const stripeAddressSchema = z
  .object({
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    line1: z.string().nullable().optional(),
    line2: z.string().nullable().optional(),
    postal_code: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
  })
  .passthrough();

const shippingDetailsSchema = z
  .object({
    name: z.string().min(1),
    address: stripeAddressSchema,
  })
  .passthrough();

const paidCheckoutSessionSchema = z
  .object({
    id: z.string().min(1),
    mode: z.literal("payment"),
    payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
    payment_intent: z
      .union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough(), z.null()])
      .optional(),
    metadata: z.record(z.string(), z.string()).nullable(),
    customer_details: z
      .object({
        email: z.string().email(),
      })
      .passthrough(),
    amount_subtotal: z.number().int().nonnegative(),
    amount_total: z.number().int().nonnegative(),
    currency: z
      .string()
      .length(3)
      .transform((currency) => currency.toLowerCase()),
    total_details: z
      .object({
        amount_shipping: z.number().int().nonnegative().nullable().optional(),
        amount_tax: z.number().int().nonnegative(),
      })
      .passthrough()
      .nullable(),
    shipping_cost: z
      .object({
        amount_total: z.number().int().nonnegative(),
      })
      .passthrough()
      .nullable(),
    collected_information: z
      .object({
        shipping_details: shippingDetailsSchema.nullable(),
      })
      .passthrough()
      .nullable(),
  })
  .passthrough();

const stripeReferenceSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1) }).passthrough(),
]);

const refundedChargeSchema = z
  .object({
    payment_intent: stripeReferenceSchema,
    amount_refunded: z.number().int().nonnegative(),
    currency: z
      .string()
      .length(3)
      .transform((currency) => currency.toLowerCase()),
  })
  .passthrough();

const stripeDisputeStatusSchema = z.enum([
  "warning_needs_response",
  "warning_under_review",
  "warning_closed",
  "needs_response",
  "under_review",
  "won",
  "lost",
  "prevented",
]);

const chargeDisputeSchema = z
  .object({
    payment_intent: stripeReferenceSchema,
    status: stripeDisputeStatusSchema,
  })
  .passthrough();

const paymentLifecycleEventSchema = z.object({
  id: z.string().min(1),
  created: z.number().int().nonnegative(),
});

type StripeEventLike = {
  id?: unknown;
  created?: unknown;
  type: string;
  data: {
    object: unknown;
  };
};

export type StripeWebhookResult =
  | { handled: false }
  | ({ handled: true } & CreatePaidOrderResult)
  | { handled: true; reservationChanged: boolean }
  | ({ handled: true; paymentUpdated: true } & RecordPaymentLifecycleResult);

export class StripeWebhookSignatureError extends Error {
  constructor() {
    super("Invalid Stripe webhook signature.");
    this.name = "StripeWebhookSignatureError";
  }
}

type StripeEventConstructor = (payload: string, signature: string, secret: string) => Stripe.Event;

export function constructVerifiedStripeEvent(
  payload: string,
  signature: string | null,
  secret: string,
  constructEvent: StripeEventConstructor,
): Stripe.Event {
  if (!signature) {
    throw new StripeWebhookSignatureError();
  }

  try {
    return constructEvent(payload, signature, secret);
  } catch {
    throw new StripeWebhookSignatureError();
  }
}

function getPaymentIntentId(
  paymentIntent: z.infer<typeof paidCheckoutSessionSchema>["payment_intent"],
): string | null {
  if (!paymentIntent) {
    return null;
  }

  return typeof paymentIntent === "string" ? paymentIntent : paymentIntent.id;
}

function getStripeReferenceId(reference: z.infer<typeof stripeReferenceSchema>): string {
  return typeof reference === "string" ? reference : reference.id;
}

export function parsePaidCheckoutData(input: unknown): PaidCheckoutData | null {
  const session = paidCheckoutSessionSchema.parse(input);

  if (session.payment_status === "unpaid") {
    return null;
  }

  const metadata = pendingCheckoutMetadataSchema.parse(session.metadata);

  return {
    pendingCheckoutToken: metadata.pendingCheckoutToken,
    reservationToken: metadata.reservationToken ?? null,
    stripeSessionId: session.id,
    stripePaymentIntentId: getPaymentIntentId(session.payment_intent),
    email: session.customer_details.email,
    subtotalCents: session.amount_subtotal,
    taxCents: session.total_details?.amount_tax ?? 0,
    shippingCents:
      session.shipping_cost?.amount_total ?? session.total_details?.amount_shipping ?? 0,
    totalCents: session.amount_total,
    currency: session.currency,
    shippingAddress: session.collected_information?.shipping_details ?? null,
  };
}

export function parseReservationEventData(input: unknown): ReservationEventData | null {
  const session = paidCheckoutSessionSchema
    .pick({
      id: true,
      metadata: true,
    })
    .parse(input);
  const metadata = pendingCheckoutMetadataSchema.parse(session.metadata);

  if (!metadata.reservationToken) {
    return null;
  }

  return {
    pendingCheckoutToken: metadata.pendingCheckoutToken,
    reservationToken: metadata.reservationToken,
    stripeSessionId: session.id,
  };
}

export function parsePaymentLifecycleUpdate(event: StripeEventLike): PaymentLifecycleUpdate | null {
  const isDisputeEvent =
    event.type === "charge.dispute.created" ||
    event.type === "charge.dispute.updated" ||
    event.type === "charge.dispute.closed" ||
    event.type === "charge.dispute.funds_withdrawn" ||
    event.type === "charge.dispute.funds_reinstated";

  if (event.type !== "charge.refunded" && !isDisputeEvent) {
    return null;
  }

  const eventMetadata = paymentLifecycleEventSchema.parse(event);
  const occurredAt = new Date(eventMetadata.created * 1000);

  if (event.type === "charge.refunded") {
    const charge = refundedChargeSchema.parse(event.data.object);

    return {
      stripeEventId: eventMetadata.id,
      stripePaymentIntentId: getStripeReferenceId(charge.payment_intent),
      kind: "refund",
      refundedCents: charge.amount_refunded,
      currency: charge.currency,
      disputeStatus: null,
      occurredAt,
    };
  }

  if (isDisputeEvent) {
    const dispute = chargeDisputeSchema.parse(event.data.object);

    return {
      stripeEventId: eventMetadata.id,
      stripePaymentIntentId: getStripeReferenceId(dispute.payment_intent),
      kind: "dispute",
      refundedCents: null,
      currency: null,
      disputeStatus: normalizeDisputeStatus(dispute.status),
      occurredAt,
    };
  }

  return null;
}

export async function processStripeEvent(
  event: StripeEventLike,
  writer: PaidOrderWriter,
  paymentLifecycleWriter?: PaymentLifecycleWriter,
  reservationWriter?: ReservationEventWriter,
): Promise<StripeWebhookResult> {
  if (event.type === "checkout.session.completed") {
    const checkout = parsePaidCheckoutData(event.data.object);

    if (!checkout) {
      const reservation = parseReservationEventData(event.data.object);

      if (!reservation) {
        return { handled: false };
      }

      if (!reservationWriter) {
        throw new Error("Inventory reservation persistence is not configured.");
      }

      const result = await reservationWriter.markAwaitingPayment(reservation);

      return { handled: true, reservationChanged: result.changed };
    }

    return {
      handled: true,
      ...(await writer.createPaidOrder(checkout)),
    };
  }

  if (event.type === "checkout.session.async_payment_succeeded") {
    const checkout = parsePaidCheckoutData(event.data.object);

    if (!checkout) {
      throw new Error("Asynchronous payment success did not contain a paid Checkout Session.");
    }

    return {
      handled: true,
      ...(await writer.createPaidOrder(checkout)),
    };
  }

  if (
    event.type === "checkout.session.expired" ||
    event.type === "checkout.session.async_payment_failed"
  ) {
    const reservation = parseReservationEventData(event.data.object);

    if (!reservation) {
      return { handled: false };
    }

    if (!reservationWriter) {
      throw new Error("Inventory reservation persistence is not configured.");
    }

    const result = await reservationWriter.releaseReservation(
      reservation,
      event.type === "checkout.session.expired" ? "stripe_session_expired" : "async_payment_failed",
    );

    return { handled: true, reservationChanged: result.changed };
  }

  const paymentUpdate = parsePaymentLifecycleUpdate(event);

  if (!paymentUpdate) {
    return { handled: false };
  }

  if (!paymentLifecycleWriter) {
    throw new Error("Payment lifecycle persistence is not configured.");
  }

  return {
    handled: true,
    paymentUpdated: true,
    ...(await paymentLifecycleWriter.recordPaymentLifecycleUpdate(paymentUpdate)),
  };
}

function normalizeDisputeStatus(
  status: z.infer<typeof stripeDisputeStatusSchema>,
): NonNullable<PaymentLifecycleUpdate["disputeStatus"]> {
  switch (status) {
    case "won":
    case "warning_closed":
      return "won";
    case "lost":
      return "lost";
    case "prevented":
      return "prevented";
    default:
      return "open";
  }
}
