import { createElement } from "react";

import { DeliveryScheduledEmail, type DeliveryScheduledView } from "@/lib/email/delivery-scheduled";
import {
  type OrderEmailClient,
  type OrderEmailConfig,
  OrderEmailDeliveryError,
} from "@/lib/email/order-email-transport";

export type DeliveryScheduledDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: DeliveryScheduledView;
};

export async function deliverDeliveryScheduled(
  delivery: DeliveryScheduledDelivery,
  config: OrderEmailConfig,
  client: OrderEmailClient,
): Promise<string> {
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      replyTo: config.supportEmail,
      subject: `Order ${delivery.order.orderNumber} is ready for delivery`,
      react: createElement(DeliveryScheduledEmail, {
        order: delivery.order,
        supportEmail: config.supportEmail,
      }),
    },
    {
      idempotencyKey: delivery.idempotencyKey,
    },
  );

  if (response.error) {
    throw new OrderEmailDeliveryError(response.error.message);
  }

  return response.data.id;
}
