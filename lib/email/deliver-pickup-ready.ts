import { createElement } from "react";

import {
  type OrderEmailClient,
  type OrderEmailConfig,
  OrderEmailDeliveryError,
} from "@/lib/email/order-email-transport";
import { PickupReadyEmail, type PickupReadyView } from "@/lib/email/pickup-ready";

export type PickupReadyDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: PickupReadyView;
};

export async function deliverPickupReady(
  delivery: PickupReadyDelivery,
  config: OrderEmailConfig,
  client: OrderEmailClient,
): Promise<string> {
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      replyTo: config.supportEmail,
      subject: `Order ${delivery.order.orderNumber} is ready to pick up`,
      react: createElement(PickupReadyEmail, {
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
