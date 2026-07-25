import { reconcileInventoryReservations } from "@/lib/checkout/reservation-reconciliation";
import { getReservationReconciliationRepository } from "@/lib/checkout/reservation-reconciliation-repository";
import { isCronAuthorized } from "@/lib/cron/authorization";
import { attemptOrderConfirmationDelivery } from "@/lib/email/order-confirmation-delivery";
import { orderConfirmationDeliveryRepository } from "@/lib/email/order-confirmation-delivery-repository";
import { sendConfirmationAfterOrderCommit } from "@/lib/email/send-after-order";
import { sendOrderConfirmation } from "@/lib/email/send-order-confirmation";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";
import { paidOrderRepository } from "@/lib/orders/paid-order-repository";
import { getStripe } from "@/lib/stripe";
import { processStripeEvent } from "@/lib/webhooks/stripe";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  try {
    const stripe = getStripe();
    const result = await reconcileInventoryReservations({
      repository: getReservationReconciliationRepository(),
      sessions: stripe.checkout.sessions,
      handlePaidSession: async (session) => {
        const webhookResult = await processStripeEvent(
          {
            type: "checkout.session.completed",
            data: { object: session },
          },
          paidOrderRepository,
        );

        await sendConfirmationAfterOrderCommit(
          webhookResult,
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
      },
      reportError: (error) => {
        captureServerException(error, {
          area: "checkout",
          operation: "checkout.reconcile-reservation",
        });
      },
    });

    return Response.json(result);
  } catch (error) {
    captureServerException(error, {
      area: "checkout",
      operation: "checkout.process-reservation-reconciliation",
    });
    return new Response("Inventory reservation reconciliation failed.", { status: 500 });
  }
}
