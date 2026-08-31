import { createElement } from "react";
import {
  type OrderEmailClient,
  type OrderEmailConfig,
  OrderEmailDeliveryError,
} from "@/lib/email/order-email-transport";
import {
  ShippingPaymentRequestEmail,
  type ShippingPaymentRequestView,
} from "@/lib/email/shipping-payment-request";

export type ShippingPaymentRequestDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: ShippingPaymentRequestView;
};

export async function deliverShippingPaymentRequest(
  delivery: ShippingPaymentRequestDelivery,
  config: OrderEmailConfig,
  client: OrderEmailClient,
): Promise<string> {
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      replyTo: config.supportEmail,
      subject: `Shipping needed for order ${delivery.order.orderNumber}`,
      react: createElement(ShippingPaymentRequestEmail, {
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
