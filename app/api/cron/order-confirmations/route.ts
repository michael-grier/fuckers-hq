import { isOrderConfirmationCronAuthorized } from "@/lib/email/order-confirmation-cron";
import { deliverDueOrderConfirmations } from "@/lib/email/order-confirmation-delivery";
import { orderConfirmationDeliveryRepository } from "@/lib/email/order-confirmation-delivery-repository";
import { sendOrderConfirmation } from "@/lib/email/send-order-confirmation";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isOrderConfirmationCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  try {
    const result = await deliverDueOrderConfirmations(
      orderConfirmationDeliveryRepository,
      sendOrderConfirmation,
      {
        reportError: (error) => {
          captureServerException(error, {
            area: "email",
            operation: "email.retry-order-confirmation",
          });
        },
      },
    );

    return Response.json(result);
  } catch (error) {
    captureServerException(error, {
      area: "email",
      operation: "email.process-order-confirmation-outbox",
    });
    return new Response("Order confirmation retry failed.", { status: 500 });
  }
}
