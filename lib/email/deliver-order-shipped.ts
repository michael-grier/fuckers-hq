import { createElement } from "react";

import {
  type OrderEmailClient,
  type OrderEmailConfig,
  OrderEmailDeliveryError,
} from "@/lib/email/order-email-transport";
import { OrderShippedEmail, type OrderShippedView } from "@/lib/email/order-shipped";

export type OrderShippedDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: OrderShippedView;
};

export async function deliverOrderShipped(
  delivery: OrderShippedDelivery,
  config: OrderEmailConfig,
  client: OrderEmailClient,
): Promise<string> {
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      replyTo: config.supportEmail,
      subject: `Order ${delivery.order.orderNumber} is on its way`,
      react: createElement(OrderShippedEmail, {
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
