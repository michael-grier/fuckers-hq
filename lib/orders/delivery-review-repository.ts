import "server-only";

import { randomUUID } from "node:crypto";

import { and, eq, inArray, ne } from "drizzle-orm";

import { resolveShippingRate } from "@/lib/checkout/shipping";
import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { orderEmailDeliveries, orderShippingPaymentRequests, orders } from "@/lib/db/schema";
import { parsePendingCheckoutLineSnapshots } from "@/lib/orders/create-paid-order";
import {
  buildShippingPaymentSessionParams,
  DeliveryReviewError,
  type DeliveryReviewRepository,
  shippingPaymentRequestLifetimeMs,
} from "@/lib/orders/delivery-review";

const shippingPaymentIdempotencyPrefix = "order-shipping-payment";

export function makeShippingPaymentEmailIdempotencyKey(
  orderId: string,
  generation: number,
): string {
  return `${shippingPaymentIdempotencyPrefix}/${orderId}/${generation}`;
}

export function createDeliveryReviewRepository(database: Database): DeliveryReviewRepository {
  return {
    async approveDeliveryAddress(orderId) {
      return database.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");

        if (!order) {
          return "not_found";
        }

        if (order.fulfillmentMethod === "delivery" && order.deliveryReviewStatus === "approved") {
          return "already_approved";
        }

        const approved = await tx
          .update(orders)
          .set({ deliveryReviewStatus: "approved" })
          .where(
            and(
              eq(orders.id, order.id),
              eq(orders.status, "paid"),
              eq(orders.inventoryStatus, "allocated"),
              eq(orders.fulfillmentMethod, "delivery"),
              eq(orders.deliveryReviewStatus, "pending"),
              eq(orders.refundStatus, "none"),
              inArray(orders.disputeStatus, ["none", "won"]),
            ),
          )
          .returning({ id: orders.id });

        return approved.length === 1 ? "approved" : "invalid_status";
      });
    },

    async prepareShippingPayment(orderId, settings, now) {
      return database.transaction(async (tx) => {
        const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");

        if (!order) {
          throw new DeliveryReviewError("Order not found.");
        }

        if (
          order.status !== "paid" ||
          order.inventoryStatus !== "allocated" ||
          order.fulfillmentMethod !== "delivery" ||
          !["pending", "shipping_payment_pending"].includes(order.deliveryReviewStatus ?? "") ||
          order.refundStatus !== "none" ||
          !["none", "won"].includes(order.disputeStatus)
        ) {
          throw new DeliveryReviewError(
            "Only an eligible local-delivery order awaiting address review can request shipping.",
          );
        }

        const existing = await tx.query.orderShippingPaymentRequests.findFirst({
          where: (requests, { eq }) => eq(requests.orderId, order.id),
          orderBy: (requests, { desc }) => [desc(requests.generation)],
        });

        if (
          existing &&
          (existing.status === "provisioning" || existing.status === "pending") &&
          existing.expiresAt > now
        ) {
          return {
            requestId: existing.id,
            generation: existing.generation,
            stripeCreateIdempotencyKey: existing.stripeCreateIdempotencyKey,
            stripeSessionParams: existing.stripeSessionParams,
            checkoutUrl: existing.checkoutUrl,
          };
        }

        if (existing?.status === "paid") {
          throw new DeliveryReviewError("The shipping payment for this order is already recorded.");
        }

        if (
          existing &&
          (existing.status === "pending" || existing.status === "provisioning") &&
          existing.expiresAt <= now
        ) {
          await tx
            .update(orderShippingPaymentRequests)
            .set({
              status: existing.status === "pending" ? "expired" : "failed",
              lastErrorCode:
                existing.status === "pending" ? "stripe_session_expired" : "provisioning_expired",
              updatedAt: now,
            })
            .where(eq(orderShippingPaymentRequests.id, existing.id));
        }

        const pendingCheckout = await tx.query.pendingCheckouts.findFirst({
          columns: { lineItems: true },
          where: (checkouts, { eq }) => eq(checkouts.stripeSessionId, order.stripeSessionId),
        });

        if (!pendingCheckout) {
          throw new DeliveryReviewError("The original checkout snapshots were not found.");
        }

        const amountCents = resolveShippingRate(
          parsePendingCheckoutLineSnapshots(pendingCheckout.lineItems),
        );
        const requestId = randomUUID();
        const generation = existing ? existing.generation + 1 : 1;
        const expiresAt = new Date(now.getTime() + shippingPaymentRequestLifetimeMs);
        const stripeCreateIdempotencyKey = `${shippingPaymentIdempotencyPrefix}/${requestId}/${generation}`;
        const stripeSessionParams = buildShippingPaymentSessionParams(
          {
            requestId,
            generation,
            orderNumber: order.orderNumber,
            customerEmail: order.email,
            amountCents,
            currency: order.currency,
            expiresAt,
          },
          settings,
        ) as unknown as Record<string, unknown>;

        await tx.insert(orderShippingPaymentRequests).values({
          id: requestId,
          orderId: order.id,
          generation,
          amountCents,
          currency: order.currency,
          stripeCreateIdempotencyKey,
          stripeSessionParams,
          expiresAt,
          createdAt: now,
          updatedAt: now,
        });

        await tx
          .update(orders)
          .set({ deliveryReviewStatus: "shipping_payment_pending" })
          .where(eq(orders.id, order.id));

        return {
          requestId,
          generation,
          stripeCreateIdempotencyKey,
          stripeSessionParams,
          checkoutUrl: null,
        };
      });
    },

    async linkShippingPaymentSession(request, session, linkedAt) {
      return database.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(orderShippingPaymentRequests)
          .where(eq(orderShippingPaymentRequests.id, request.requestId))
          .for("update");

        if (!current || current.generation !== request.generation) {
          throw new DeliveryReviewError("The shipping-payment request was replaced.");
        }

        if (current.status === "paid") {
          return { checkoutUrl: session.url, emailQueued: false };
        }

        if (current.status === "pending") {
          if (current.stripeSessionId !== session.id || !current.checkoutUrl) {
            throw new DeliveryReviewError("The shipping-payment Session does not match.");
          }

          return { checkoutUrl: current.checkoutUrl, emailQueued: false };
        }

        if (current.status !== "provisioning") {
          throw new DeliveryReviewError("The shipping-payment request is no longer active.");
        }

        await tx
          .update(orderShippingPaymentRequests)
          .set({
            status: "pending",
            stripeSessionId: session.id,
            checkoutUrl: session.url,
            lastErrorCode: null,
            updatedAt: linkedAt,
          })
          .where(
            and(
              eq(orderShippingPaymentRequests.id, current.id),
              eq(orderShippingPaymentRequests.generation, current.generation),
              eq(orderShippingPaymentRequests.status, "provisioning"),
            ),
          );

        const order = await tx.query.orders.findFirst({
          where: (orders, { eq }) => eq(orders.id, current.orderId),
        });
        const canEmail =
          order?.status === "paid" &&
          order.inventoryStatus === "allocated" &&
          order.fulfillmentMethod === "delivery" &&
          order.deliveryReviewStatus === "shipping_payment_pending" &&
          order.refundStatus === "none" &&
          (order.disputeStatus === "none" || order.disputeStatus === "won");

        if (!canEmail) {
          await tx
            .update(orders)
            .set({ deliveryReviewStatus: "shipping_payment_exception" })
            .where(eq(orders.id, current.orderId));

          return { checkoutUrl: session.url, emailQueued: false };
        }

        const idempotencyKey = makeShippingPaymentEmailIdempotencyKey(
          current.orderId,
          current.generation,
        );
        await tx
          .insert(orderEmailDeliveries)
          .values({
            orderId: current.orderId,
            kind: "shipping_payment_request",
            idempotencyKey,
            nextAttemptAt: linkedAt,
            createdAt: linkedAt,
            updatedAt: linkedAt,
          })
          .onConflictDoUpdate({
            target: [orderEmailDeliveries.orderId, orderEmailDeliveries.kind],
            set: {
              status: "pending",
              idempotencyKey,
              attemptCount: 0,
              nextAttemptAt: linkedAt,
              lastAttemptAt: null,
              lastErrorAt: null,
              lastErrorCode: null,
              providerMessageId: null,
              deliveredAt: null,
              updatedAt: linkedAt,
            },
          });

        return { checkoutUrl: session.url, emailQueued: true };
      });
    },

    async markShippingPaymentCreationFailed(request, failedAt) {
      await database.transaction(async (tx) => {
        const failed = await tx
          .update(orderShippingPaymentRequests)
          .set({ status: "failed", lastErrorCode: "stripe_session_creation", updatedAt: failedAt })
          .where(
            and(
              eq(orderShippingPaymentRequests.id, request.requestId),
              eq(orderShippingPaymentRequests.generation, request.generation),
              eq(orderShippingPaymentRequests.status, "provisioning"),
            ),
          )
          .returning({ orderId: orderShippingPaymentRequests.orderId });

        if (failed[0]) {
          await tx
            .update(orders)
            .set({ deliveryReviewStatus: "pending" })
            .where(
              and(
                eq(orders.id, failed[0].orderId),
                eq(orders.deliveryReviewStatus, "shipping_payment_pending"),
                ne(orders.status, "fulfilled"),
              ),
            );
        }
      });
    },
  };
}

export const deliveryReviewRepository = createDeliveryReviewRepository(getDb());
