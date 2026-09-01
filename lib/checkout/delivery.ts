import type { Env } from "@/lib/env";

export const LOCAL_DELIVERY_MINIMUM_SUBTOTAL_CENTS = 3_000;

/** The service area local delivery is offered in, e.g. "Rocky View County, Alberta". */
export type DeliveryArea = {
  areaName: string;
  instructions: string | null;
};

type DeliveryEnv = Pick<Env, "DELIVERY_ENABLED" | "DELIVERY_AREA_NAME" | "DELIVERY_INSTRUCTIONS">;

/**
 * Returns the configured local-delivery area, or null when delivery is unavailable.
 *
 * Delivery is only offered when the service area is named, so the store never advertises a
 * delivery option without saying where it applies. Returning null instead of throwing keeps an
 * incomplete delivery configuration from breaking shipping checkout, which is the fallback every
 * order can always use.
 */
export function resolveDeliveryArea(env: DeliveryEnv): DeliveryArea | null {
  if (!env.DELIVERY_ENABLED) {
    return null;
  }

  const areaName = env.DELIVERY_AREA_NAME?.trim();

  if (!areaName) {
    return null;
  }

  return {
    areaName,
    instructions: env.DELIVERY_INSTRUCTIONS?.trim() || null,
  };
}
