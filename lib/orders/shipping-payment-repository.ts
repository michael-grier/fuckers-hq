import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import {
  orderEmailDeliveries,
  orderShippingPaymentRequests,
  orders,
  stripePaymentEvents,
} from "@/lib/db/schema";
import type { ShippingPaymentEventWriter } from "@/lib/orders/delivery-review";
import { DeliveryReviewError } from "@/lib/orders/delivery-review";
import { makeShippingPaymentEmailIdempotencyKey } from "@/lib/orders/delivery-review-repository";
import { derivePaymentLifecycleState } from "@/lib/orders/payment-lifecycle";

/** Persists supplemental shipping payments without changing the original order's financials. */
export function createShippingPaymentRepository(database: Database): ShippingPaymentEventWriter {
  return {
    async recordPaidShippingPayment(payment) {
      return database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${payment.stripePaymentIntentId}))`,
        );

        const reference = await tx.query.orderShippingPaymentRequests.findFirst({
          columns: { orderId: true },
          where: (requests, { eq }) => eq(requests.id, payment.requestId),
        });

        if (!reference) {
          // Returning 500 makes Stripe retry while an operator investigates; a verified payment
          // must never be acknowledged without a durable local record.
          throw new DeliveryReviewError("Shipping-payment request was not found.");
        }

        // Delivery-review transactions lock the order before its request rows. Matching that order
        // prevents an expired-session replacement from deadlocking with this paid webhook.
        const [order] = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, reference.orderId))
          .for("update");

        if (!order) {
          throw new DeliveryReviewError("Shipping-payment order was not found.");
        }

        const [request] = await tx
          .select()
          .from(orderShippingPaymentRequests)
          .where(
            and(
              eq(orderShippingPaymentRequests.id, payment.requestId),
              eq(orderShippingPaymentRequests.orderId, order.id),
            ),
          )
          .for("update");

        if (!request || request.generation !== payment.generation) {
          throw new DeliveryReviewError("Shipping-payment request was not found.");
        }

        if (
          request.amountCents !== payment.subtotalCents ||
          request.currency !== payment.currency ||
          payment.totalCents !== payment.subtotalCents + payment.taxCents
        ) {
          throw new DeliveryReviewError("Shipping-payment totals do not match the request.");
        }

        if (request.status === "paid") {
          if (
            request.stripeSessionId !== payment.stripeSessionId ||
            request.stripePaymentIntentId !== payment.stripePaymentIntentId
          ) {
            throw new DeliveryReviewError("Shipping payment conflicts with the recorded payment.");
          }

          return { changed: false, orderId: request.orderId };
        }

        if (request.stripeSessionId && request.stripeSessionId !== payment.stripeSessionId) {
          throw new DeliveryReviewError("Shipping payment does not match its Checkout Session.");
        }

        const paymentEvents = await tx
          .select()
          .from(stripePaymentEvents)
          .where(eq(stripePaymentEvents.stripePaymentIntentId, payment.stripePaymentIntentId));
        const paymentState = derivePaymentLifecycleState(
          payment.totalCents,
          payment.currency,
          paymentEvents.map((event) => ({
            stripeEventId: event.stripeEventId,
            stripePaymentIntentId: event.stripePaymentIntentId,
            kind: event.kind,
            refundedCents: event.refundedCents,
            currency: event.currency,
            disputeStatus: event.disputeStatus === "none" ? null : event.disputeStatus,
            occurredAt: event.occurredAt,
          })),
        );
        const paidAt = new Date();

        await tx
          .update(orderShippingPaymentRequests)
          .set({
            status: "paid",
            stripeSessionId: payment.stripeSessionId,
            stripePaymentIntentId: payment.stripePaymentIntentId,
            taxCents: payment.taxCents,
            totalCents: payment.totalCents,
            shippingAddress: payment.shippingAddress,
            paidAt,
            refundStatus: paymentState.refundStatus,
            refundedCents: paymentState.refundedCents,
            disputeStatus: paymentState.disputeStatus,
            lastErrorCode: null,
            updatedAt: paidAt,
          })
          .where(eq(orderShippingPaymentRequests.id, request.id));

        // A payment can beat the email attempt. Cancel only an unfinished exact generation so a
        // stale retry cannot email a paid customer, while preserving completed delivery history.
        await tx
          .update(orderEmailDeliveries)
          .set({ status: "cancelled", updatedAt: paidAt })
          .where(
            and(
              eq(orderEmailDeliveries.orderId, request.orderId),
              eq(orderEmailDeliveries.kind, "shipping_payment_request"),
              eq(
                orderEmailDeliveries.idempotencyKey,
                makeShippingPaymentEmailIdempotencyKey(request.orderId, request.generation),
              ),
              inArray(orderEmailDeliveries.status, ["pending", "processing", "retry", "failed"]),
            ),
          );

        const paymentIsEligible =
          paymentState.refundStatus === "none" &&
          (paymentState.disputeStatus === "none" || paymentState.disputeStatus === "won");
        const newerRequest = await tx.query.orderShippingPaymentRequests.findFirst({
          columns: { id: true },
          where: (requests, { and, eq, gt }) =>
            and(eq(requests.orderId, request.orderId), gt(requests.generation, request.generation)),
        });
        const orderCanConvert =
          !newerRequest &&
          order.status === "paid" &&
          order.inventoryStatus === "allocated" &&
          order.fulfillmentMethod === "delivery" &&
          order.deliveryReviewStatus === "shipping_payment_pending" &&
          order.refundStatus === "none" &&
          (order.disputeStatus === "none" || order.disputeStatus === "won");

        await tx
          .update(orders)
          .set(
            paymentIsEligible && orderCanConvert
              ? {
                  fulfillmentMethod: "shipping",
                  deliveryReviewStatus: "shipping_payment_received",
                  // The supplemental Checkout address is the final shipping destination. Keep the
                  // original value when Stripe returned no valid Canadian province.
                  destinationProvince: payment.destinationProvince ?? order.destinationProvince,
                }
              : { deliveryReviewStatus: "shipping_payment_exception" },
          )
          .where(eq(orders.id, order.id));

        return { changed: true, orderId: order.id };
      });
    },

    async closeShippingPayment(reference, reason) {
      return database.transaction(async (tx) => {
        const [request] = await tx
          .select()
          .from(orderShippingPaymentRequests)
          .where(eq(orderShippingPaymentRequests.id, reference.requestId))
          .for("update");

        if (
          !request ||
          request.generation !== reference.generation ||
          (request.stripeSessionId && request.stripeSessionId !== reference.stripeSessionId)
        ) {
          return { changed: false, orderId: request?.orderId ?? null };
        }

        if (
          request.status === "paid" ||
          request.status === "expired" ||
          request.status === "failed"
        ) {
          return { changed: false, orderId: request.orderId };
        }

        const closedAt = new Date();
        await tx
          .update(orderShippingPaymentRequests)
          .set({
            status: reason === "expired" ? "expired" : "failed",
            stripeSessionId: reference.stripeSessionId,
            lastErrorCode: reason === "expired" ? "stripe_session_expired" : "async_payment_failed",
            updatedAt: closedAt,
          })
          .where(eq(orderShippingPaymentRequests.id, request.id));

        const newer = await tx.query.orderShippingPaymentRequests.findFirst({
          columns: { id: true },
          where: (requests, { and, eq, gt }) =>
            and(eq(requests.orderId, request.orderId), gt(requests.generation, request.generation)),
        });

        if (!newer) {
          await tx
            .update(orders)
            .set({ deliveryReviewStatus: "pending" })
            .where(
              and(
                eq(orders.id, request.orderId),
                eq(orders.fulfillmentMethod, "delivery"),
                eq(orders.deliveryReviewStatus, "shipping_payment_pending"),
              ),
            );
        }

        return { changed: true, orderId: request.orderId };
      });
    },
  };
}

let defaultRepository: ShippingPaymentEventWriter | undefined;

function getDefaultRepository(): ShippingPaymentEventWriter {
  defaultRepository ??= createShippingPaymentRepository(getDb());
  return defaultRepository;
}

export const shippingPaymentRepository: ShippingPaymentEventWriter = {
  recordPaidShippingPayment: (payment) => getDefaultRepository().recordPaidShippingPayment(payment),
  closeShippingPayment: (reference, reason) =>
    getDefaultRepository().closeShippingPayment(reference, reason),
};
