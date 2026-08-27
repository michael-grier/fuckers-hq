import type { Env } from "@/lib/env";

export const LOCAL_DELIVERY_MINIMUM_CENTS = 3_000;

/** The public name of the area where local delivery is offered. */
export type DeliveryArea = {
  areaName: string;
  instructions: string | null;
};

type DeliveryEnv = Pick<
  Env,
  | "DELIVERY_ENABLED"
  | "DELIVERY_AREA_NAME"
  | "DELIVERY_INSTRUCTIONS"
  | "DELIVERY_ELIGIBILITY_SECRET"
>;

/**
 * Returns the configured local-delivery area, or null when delivery is unavailable.
 *
 * Delivery is only offered when the service area and signing secret are configured. Returning
 * null instead of throwing keeps an incomplete configuration from breaking shipping checkout,
 * which is the fallback every order can always use.
 */
export function resolveDeliveryArea(env: DeliveryEnv): DeliveryArea | null {
  if (!env.DELIVERY_ENABLED) {
    return null;
  }

  const areaName = env.DELIVERY_AREA_NAME?.trim();

  if (!areaName || !env.DELIVERY_ELIGIBILITY_SECRET) {
    return null;
  }

  return {
    areaName,
    instructions: env.DELIVERY_INSTRUCTIONS?.trim() || null,
  };
}
