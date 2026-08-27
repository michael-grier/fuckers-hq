import { resolveDeliveryArea } from "@/lib/checkout/delivery";
import { evaluateDeliveryEligibility } from "@/lib/checkout/delivery-eligibility";
import { geocodeRockyViewAddress } from "@/lib/checkout/delivery-geocoder";
import { getDeliveryCartSubtotalCents } from "@/lib/checkout/delivery-repository";
import { createDeliveryEligibilityToken } from "@/lib/checkout/delivery-token";
import { CheckoutError } from "@/lib/checkout/errors";
import { env } from "@/lib/env";
import { readJsonRequest } from "@/lib/http/read-json-request";
import { captureServerException } from "@/lib/observability/server";
import { deliveryEligibilityRequestSchema } from "@/lib/validators/delivery";

export const runtime = "nodejs";

const maxEligibilityRequestBytes = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonRequest(request, maxEligibilityRequestBytes);

  if (!body.success) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  const input = deliveryEligibilityRequestSchema.safeParse(body.data);

  if (!input.success) {
    return Response.json({ error: "Enter a valid delivery address." }, { status: 400 });
  }

  const deliveryArea = resolveDeliveryArea(env);
  const secret = env.DELIVERY_ELIGIBILITY_SECRET;

  if (!deliveryArea || !secret) {
    return Response.json({
      status: "unavailable",
      message: "We couldn't check local delivery right now. Shipping is still available.",
    });
  }

  try {
    return Response.json(
      await evaluateDeliveryEligibility(input.data, {
        getSubtotalCents: getDeliveryCartSubtotalCents,
        geocode: geocodeRockyViewAddress,
        createToken: (address, reviewRequired) =>
          createDeliveryEligibilityToken(address, reviewRequired, secret),
      }),
    );
  } catch (error) {
    if (error instanceof CheckoutError && error.status !== 500) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    captureServerException(error, {
      area: "checkout",
      operation: "delivery.check-eligibility",
    });

    return Response.json({
      status: "unavailable",
      message: "We couldn't check local delivery right now. Shipping is still available.",
    });
  }
}
