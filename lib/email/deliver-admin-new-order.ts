import { createElement } from "react";

import { AdminNewOrderEmail, type AdminNewOrderView } from "@/lib/email/admin-new-order";
import {
  type OrderEmailClient,
  type OrderEmailConfig,
  OrderEmailDeliveryError,
} from "@/lib/email/order-email-transport";

export type AdminNewOrderDelivery = {
  orderId: string;
  idempotencyKey: string;
  recipientEmail: string;
  order: AdminNewOrderView;
};

/** Sends one paid-order alert to the configured operational administrator. */
export async function deliverAdminNewOrder(
  delivery: AdminNewOrderDelivery,
  config: Pick<OrderEmailConfig, "from">,
  client: OrderEmailClient,
): Promise<string> {
  const response = await client.send(
    {
      from: config.from,
      to: delivery.recipientEmail,
      subject: `New paid order ${delivery.order.orderNumber}`,
      react: createElement(AdminNewOrderEmail, { order: delivery.order }),
    },
    { idempotencyKey: delivery.idempotencyKey },
  );

  if (response.error) {
    throw new OrderEmailDeliveryError(response.error.message);
  }

  return response.data.id;
}
