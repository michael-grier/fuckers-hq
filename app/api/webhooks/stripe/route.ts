import type Stripe from "stripe";

import { attemptOrderConfirmationDelivery } from "@/lib/email/order-confirmation-delivery";
import { orderConfirmationDeliveryRepository } from "@/lib/email/order-confirmation-delivery-repository";
import { sendConfirmationAfterOrderCommit } from "@/lib/email/send-after-order";
import { sendOrderConfirmation } from "@/lib/email/send-order-confirmation";
import { requireEnv } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";
import { paidOrderRepository } from "@/lib/orders/paid-order-repository";
import { paymentLifecycleRepository } from "@/lib/orders/payment-lifecycle-repository";
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
    const result = await processStripeEvent(event, paidOrderRepository, paymentLifecycleRepository);

    await sendConfirmationAfterOrderCommit(
      result,
      (orderId) =>
        attemptOrderConfirmationDelivery(
          orderId,
          orderConfirmationDeliveryRepository,
          sendOrderConfirmation,
          { force: true },
        ),
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
