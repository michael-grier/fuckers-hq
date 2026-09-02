import { createElement } from "react";

import {
  type OrderEmailClient,
  type OrderEmailConfig,
  OrderEmailDeliveryError,
} from "@/lib/email/order-email-transport";
import { RefundEmail, type RefundEmailView } from "@/lib/email/refund";

export type RefundEmailDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: RefundEmailView;
};

/** Sends one partial or full refund milestone through the shared Resend boundary. */
export async function deliverRefund(
  delivery: RefundEmailDelivery,
  config: OrderEmailConfig,
  client: OrderEmailClient,
): Promise<string> {
  const isFullRefund = delivery.order.refundCumulativeCents === delivery.order.totalCents;
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      replyTo: config.supportEmail,
      subject: isFullRefund
        ? `Order ${delivery.order.orderNumber} has been fully refunded`
        : `Partial refund issued for order ${delivery.order.orderNumber}`,
      react: createElement(RefundEmail, {
        order: delivery.order,
        supportEmail: config.supportEmail,
      }),
    },
    { idempotencyKey: delivery.idempotencyKey },
  );

  if (response.error) {
    throw new OrderEmailDeliveryError(response.error.message);
  }

  return response.data.id;
}
