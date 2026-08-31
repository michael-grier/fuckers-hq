import type Stripe from "stripe";

import { reservationEventRepository } from "@/lib/checkout/reservation-event-repository";
import { attemptOrderEmailDelivery } from "@/lib/email/order-email-delivery";
import { orderEmailDeliveryRepository } from "@/lib/email/order-email-delivery-repository";
import { sendConfirmationAfterOrderCommit } from "@/lib/email/send-after-order";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { requireEnv } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";
import { paidOrderRepository } from "@/lib/orders/paid-order-repository";
import { paymentLifecycleRepository } from "@/lib/orders/payment-lifecycle-repository";
import { shippingPaymentRepository } from "@/lib/orders/shipping-payment-repository";
import { getStripe } from "@/lib/stripe";
import { constructVerifiedStripeEvent, processStripeEvent } from "@/lib/webhooks/stripe";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  const stripe = getStripe();
  const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
  let event: Stripe.Event;

  try {
    event = constructVerifiedStripeEvent(
      payload,
      signature,
      webhookSecret,
      stripe.webhooks.constructEvent.bind(stripe.webhooks),
    );
  } catch {
    return new Response("Invalid signature.", { status: 400 });
  }

  try {
    const result = await processStripeEvent(
      event,
      paidOrderRepository,
      paymentLifecycleRepository,
      reservationEventRepository,
      shippingPaymentRepository,
    );

    await sendConfirmationAfterOrderCommit(
      result,
      (ref) =>
        attemptOrderEmailDelivery(ref, orderEmailDeliveryRepository, sendOrderEmail, {
          force: true,
        }),
      (error) => {
        captureServerException(error, {
          area: "email",
          operation: "email.send-order-confirmation",
        });
      },
    );

    return new Response("ok");
  } catch (error) {
    captureServerException(error, {
      area: "webhook",
      operation: "webhook.process-stripe-event",
    });
    return new Response("Webhook processing failed.", { status: 500 });
  }
}
