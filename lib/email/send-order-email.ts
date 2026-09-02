import "server-only";

import { and, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { orderShippingPaymentRequests } from "@/lib/db/schema";
import { deliverDeliveryScheduled } from "@/lib/email/deliver-delivery-scheduled";
import {
  type ConfirmationEmailDelivery,
  deliverOrderConfirmation,
} from "@/lib/email/deliver-order-confirmation";
import { deliverOrderShipped } from "@/lib/email/deliver-order-shipped";
import { deliverRefund } from "@/lib/email/deliver-refund";
import { deliverShippingPaymentRequest } from "@/lib/email/deliver-shipping-payment-request";
import type { OrderEmailRef } from "@/lib/email/order-email-delivery";
import { getResend } from "@/lib/email/resend";
import { requireEnv } from "@/lib/env";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";
import { resolveOrderTracking } from "@/lib/orders/shipping-carriers";

/**
 * Renders and sends the email owed for one outbox row. Throwing here leaves the row claimable so
 * the outbox retries it; it never mutates order state.
 */
export async function sendOrderEmail(ref: OrderEmailRef, idempotencyKey: string): Promise<string> {
  const database = getDb();
  const order = await database.query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.id, ref.orderId),
    with: {
      items: true,
      shippingPaymentRequests: {
        where: (requests, { eq }) => eq(requests.status, "paid"),
        orderBy: (requests, { asc }) => [asc(requests.paidAt)],
        limit: 1,
      },
    },
  });

  if (!order) {
    throw new Error(`Order ${ref.orderId} was not found for its ${ref.kind} email.`);
  }

  const config = {
    from: requireEnv("EMAIL_FROM"),
    supportEmail: requireEnv("SUPPORT_EMAIL"),
  };

  if (ref.kind === "refund") {
    const deliveryId = ref.deliveryId;

    if (!deliveryId) {
      throw new Error("Refund email is missing its delivery id.");
    }

    const refundDelivery = await database.query.orderEmailDeliveries.findFirst({
      columns: { refundAmountCents: true, refundCumulativeCents: true },
      where: (deliveries, { and, eq }) =>
        and(
          eq(deliveries.id, deliveryId),
          eq(deliveries.orderId, order.id),
          eq(deliveries.kind, "refund"),
        ),
    });

    if (
      !refundDelivery?.refundAmountCents ||
      !refundDelivery.refundCumulativeCents ||
      refundDelivery.refundCumulativeCents > order.totalCents
    ) {
      throw new Error("Refund email has an invalid financial snapshot.");
    }

    return deliverRefund(
      {
        orderId: order.id,
        idempotencyKey,
        recipientEmail: order.email,
        order: {
          orderNumber: order.orderNumber,
          currency: order.currency,
          totalCents: order.totalCents,
          refundAmountCents: refundDelivery.refundAmountCents,
          refundCumulativeCents: refundDelivery.refundCumulativeCents,
        },
      },
      config,
      getResend().emails,
    );
  }

  if (ref.kind === "shipping_payment_request") {
    const generation = Number(idempotencyKey.split("/").at(-1));

    if (!Number.isSafeInteger(generation) || generation <= 0) {
      throw new Error("Shipping-payment email has an invalid generation key.");
    }

    const request = await database.query.orderShippingPaymentRequests.findFirst({
      where: and(
        eq(orderShippingPaymentRequests.orderId, order.id),
        eq(orderShippingPaymentRequests.generation, generation),
        eq(orderShippingPaymentRequests.status, "pending"),
      ),
    });

    if (!request?.checkoutUrl) {
      throw new Error("Shipping-payment email has no active Checkout link.");
    }

    return deliverShippingPaymentRequest(
      {
        orderId: order.id,
        idempotencyKey,
        recipientEmail: order.email,
        order: {
          orderNumber: order.orderNumber,
          amountCents: request.amountCents,
          currency: request.currency,
          checkoutUrl: request.checkoutUrl,
          expiresAt: request.expiresAt,
        },
      },
      config,
      getResend().emails,
    );
  }

  if (ref.kind === "delivery_scheduled") {
    // Built entirely from the order record, so a later configuration change can never make this
    // notification undeliverable or claim a service area the order was not placed under.
    return deliverDeliveryScheduled(
      {
        orderId: order.id,
        idempotencyKey,
        recipientEmail: order.email,
        order: {
          orderNumber: order.orderNumber,
          currency: order.currency,
          totalCents: order.totalCents,
          items: order.items.map((item) => ({
            productName: item.productNameSnapshot,
            variantName: item.variantNameSnapshot,
            quantity: item.quantity,
          })),
          deliveryAddressLines: getShippingAddressLines(order.shippingAddress),
        },
      },
      config,
      getResend().emails,
    );
  }

  if (ref.kind === "shipped") {
    // Tracking stays optional. A shipment recorded without a number still tells the customer the
    // order left, which is the point of the notification.
    const tracking = resolveOrderTracking(order);

    return deliverOrderShipped(
      {
        orderId: order.id,
        idempotencyKey,
        recipientEmail: order.email,
        order: {
          orderNumber: order.orderNumber,
          items: order.items.map((item) => ({
            productName: item.productNameSnapshot,
            variantName: item.variantNameSnapshot,
            quantity: item.quantity,
          })),
          shippingAddressLines: getShippingAddressLines(
            order.shippingPaymentRequests[0]?.shippingAddress ?? order.shippingAddress,
          ),
          tracking,
        },
      },
      config,
      getResend().emails,
    );
  }

  const delivery: ConfirmationEmailDelivery = {
    orderId: order.id,
    idempotencyKey,
    recipientEmail: order.email,
    order: {
      orderNumber: order.orderNumber,
      currency: order.currency,
      subtotalCents: order.subtotalCents,
      taxCents: order.taxCents,
      shippingCents: order.shippingCents,
      totalCents: order.totalCents,
      items: order.items.map((item) => ({
        productName: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        unitPriceCents: item.unitPriceCentsSnapshot,
        quantity: item.quantity,
      })),
      shippingAddressLines: getShippingAddressLines(order.shippingAddress),
      isLocalDelivery: order.fulfillmentMethod === "delivery",
    },
  };

  return deliverOrderConfirmation(delivery, config, getResend().emails);
}
