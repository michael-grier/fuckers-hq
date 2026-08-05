import "server-only";

import { resolvePickupLocation, splitPickupAddressLines } from "@/lib/checkout/pickup";
import { getDb } from "@/lib/db/client";
import {
  type ConfirmationEmailDelivery,
  deliverOrderConfirmation,
} from "@/lib/email/deliver-order-confirmation";
import { deliverPickupReady } from "@/lib/email/deliver-pickup-ready";
import type { OrderEmailRef } from "@/lib/email/order-email-delivery";
import { getResend } from "@/lib/email/resend";
import { env, requireEnv } from "@/lib/env";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";

/**
 * Renders and sends the email owed for one outbox row. Throwing here leaves the row claimable so
 * the outbox retries it; it never mutates order state.
 */
export async function sendOrderEmail(ref: OrderEmailRef, idempotencyKey: string): Promise<string> {
  const order = await getDb().query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.id, ref.orderId),
    with: {
      items: true,
    },
  });

  if (!order) {
    throw new Error(`Order ${ref.orderId} was not found for its ${ref.kind} email.`);
  }

  const config = {
    from: requireEnv("EMAIL_FROM"),
    supportEmail: requireEnv("SUPPORT_EMAIL"),
  };
  const pickupLocation = order.fulfillmentMethod === "pickup" ? resolvePickupLocation(env) : null;
  const pickupAddressLines = pickupLocation ? splitPickupAddressLines(pickupLocation.address) : [];

  if (ref.kind === "pickup_ready") {
    if (!pickupLocation) {
      // Retryable on purpose: the address can be restored by fixing configuration, and the email
      // must not claim a pickup location the shop has not actually published.
      throw new Error("PICKUP_LOCATION is required.");
    }

    return deliverPickupReady(
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
          pickupLocationName: pickupLocation.name,
          pickupAddressLines,
          pickupHours: pickupLocation.hours,
          pickupInstructions: pickupLocation.instructions,
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
      pickup: pickupLocation
        ? {
            locationName: pickupLocation.name,
            addressLines: pickupAddressLines,
            hours: pickupLocation.hours,
          }
        : null,
    },
  };

  return deliverOrderConfirmation(delivery, config, getResend().emails);
}
