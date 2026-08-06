import { randomUUID } from "node:crypto";

import { createHostedCheckout } from "@/lib/checkout/create-hosted-checkout";
import { toCheckoutErrorResponse } from "@/lib/checkout/error-response";
import { resolvePickupLocation } from "@/lib/checkout/pickup";
import { checkoutRepository } from "@/lib/checkout/repository";
import { parseAllowedShippingCountries } from "@/lib/checkout/shipping";
import { env, requireEnv } from "@/lib/env";
import { readJsonRequest } from "@/lib/http/read-json-request";
import { captureServerException } from "@/lib/observability/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const maxCheckoutRequestBytes = 16 * 1024;

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonRequest(request, maxCheckoutRequestBytes);

  if (!body.success) {
    return Response.json({ error: body.error }, { status: body.status });
  }

  try {
    return Response.json(
      await createHostedCheckout(
        body.data,
        {
          appUrl: requireEnv("NEXT_PUBLIC_APP_URL"),
          allowedCountries: parseAllowedShippingCountries(env.SHIPPING_ALLOWED_COUNTRIES),
          standardShippingRateCents: requireEnv("SHIPPING_STANDARD_RATE_CENTS"),
          freeShippingThresholdCents: requireEnv("SHIPPING_FREE_THRESHOLD_CENTS"),
          taxEnabled: env.STRIPE_TAX_ENABLED,
          pickupLocation: resolvePickupLocation(env),
        },
        {
          repository: checkoutRepository,
          sessions: getStripe().checkout.sessions,
          createToken: randomUUID,
        },
      ),
    );
  } catch (error) {
    return toCheckoutErrorResponse(error, (unexpectedError) => {
      captureServerException(unexpectedError, {
        area: "checkout",
        operation: "checkout.create-session",
      });
    });
  }
}
