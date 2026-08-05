import { isOrderConfirmationCronAuthorized } from "@/lib/email/order-confirmation-cron";
import { deliverDueOrderEmails } from "@/lib/email/order-email-delivery";
import { orderEmailDeliveryRepository } from "@/lib/email/order-email-delivery-repository";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  if (!isOrderConfirmationCronAuthorized(request.headers.get("authorization"), env.CRON_SECRET)) {
    return new Response("Unauthorized.", { status: 401 });
  }

  try {
    const result = await deliverDueOrderEmails(orderEmailDeliveryRepository, sendOrderEmail, {
      reportError: (error) => {
        captureServerException(error, {
          area: "email",
          operation: "email.retry-order-email",
        });
      },
    });

    return Response.json(result);
  } catch (error) {
    captureServerException(error, {
      area: "email",
      operation: "email.process-order-email-outbox",
    });
    return new Response("Order email retry failed.", { status: 500 });
  }
}
