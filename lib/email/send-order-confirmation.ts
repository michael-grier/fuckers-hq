import "server-only";

import { getDb } from "@/lib/db/client";
import {
  deliverOrderConfirmation,
  type OrderConfirmationDelivery,
} from "@/lib/email/deliver-order-confirmation";
import { getResend } from "@/lib/email/resend";
import { requireEnv } from "@/lib/env";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";

export async function sendOrderConfirmation(
  orderId: string,
  idempotencyKey: string,
): Promise<string> {
  const order = await getDb().query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.id, orderId),
    with: {
      items: true,
    },
  });

  if (!order) {
    throw new Error(`Order ${orderId} was not found for confirmation email.`);
  }

  const delivery: OrderConfirmationDelivery = {
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
    },
  };

  return deliverOrderConfirmation(
    delivery,
    {
      from: requireEnv("EMAIL_FROM"),
      supportEmail: requireEnv("SUPPORT_EMAIL"),
    },
    getResend().emails,
  );
}
