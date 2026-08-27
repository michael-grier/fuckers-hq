import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import type { DeliveryAddress } from "@/lib/validators/delivery";
import { deliveryAddressSchema } from "@/lib/validators/delivery";

const tokenLifetimeSeconds = 15 * 60;

const deliveryEligibilityClaimsSchema = z
  .object({
    version: z.literal(1),
    address: deliveryAddressSchema,
    reviewRequired: z.boolean(),
    expiresAt: z.number().int().positive(),
  })
  .strict();

export type DeliveryEligibilityClaims = z.infer<typeof deliveryEligibilityClaimsSchema>;

/** Creates a short-lived, tamper-evident proof that the server checked this address. */
export function createDeliveryEligibilityToken(
  address: DeliveryAddress,
  reviewRequired: boolean,
  secret: string,
  now = new Date(),
): string {
  const claims: DeliveryEligibilityClaims = {
    version: 1,
    address,
    reviewRequired,
    expiresAt: Math.floor(now.getTime() / 1000) + tokenLifetimeSeconds,
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

/** Verifies signature and expiry before delivery can reserve stock or create a Stripe Session. */
export function verifyDeliveryEligibilityToken(
  token: string,
  secret: string,
  now = new Date(),
): DeliveryEligibilityClaims | null {
  const [payload, signature, extra] = token.split(".");

  if (!payload || !signature || extra) {
    return null;
  }

  const expected = Buffer.from(sign(payload, secret));
  const received = Buffer.from(signature);

  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const claims = deliveryEligibilityClaimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );

    return claims.expiresAt >= Math.floor(now.getTime() / 1000) ? claims : null;
  } catch {
    return null;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
