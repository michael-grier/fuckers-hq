import { createElement } from "react";
import type { CreateEmailOptions, CreateEmailResponse } from "resend";

import { OrderConfirmationEmail, type OrderConfirmationView } from "@/lib/email/order-confirmation";

export type OrderConfirmationDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: OrderConfirmationView;
};

export type OrderConfirmationEmailConfig = {
  from: string;
  supportEmail: string;
};

export type OrderConfirmationEmailClient = {
  send: (
    message: CreateEmailOptions,
    options: { idempotencyKey: string },
  ) => Promise<CreateEmailResponse>;
};

export class OrderConfirmationDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderConfirmationDeliveryError";
  }
}

export async function deliverOrderConfirmation(
  delivery: OrderConfirmationDelivery,
  config: OrderConfirmationEmailConfig,
  client: OrderConfirmationEmailClient,
): Promise<string> {
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      replyTo: config.supportEmail,
      subject: `Order ${delivery.order.orderNumber} confirmed`,
      react: createElement(OrderConfirmationEmail, {
        order: delivery.order,
        supportEmail: config.supportEmail,
      }),
    },
    {
      idempotencyKey: delivery.idempotencyKey,
    },
  );

  if (response.error) {
    throw new OrderConfirmationDeliveryError(response.error.message);
  }

  return response.data.id;
}
