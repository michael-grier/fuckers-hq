import type { Env } from "@/lib/env";

export type PickupLocation = {
  name: string;
  address: string;
  hours: string;
  instructions: string | null;
};

type PickupEnv = Pick<
  Env,
  | "PICKUP_ENABLED"
  | "PICKUP_LOCATION_NAME"
  | "PICKUP_ADDRESS"
  | "PICKUP_HOURS"
  | "PICKUP_INSTRUCTIONS"
>;

/**
 * Returns the configured pickup location, or null when pickup is unavailable.
 *
 * A location is only offered when every customer-facing detail is present. Returning null instead
 * of throwing keeps an incomplete pickup configuration from breaking shipping checkout, which is
 * the fallback every order can always use.
 */
export function resolvePickupLocation(env: PickupEnv): PickupLocation | null {
  if (!env.PICKUP_ENABLED) {
    return null;
  }

  const name = env.PICKUP_LOCATION_NAME?.trim();
  const address = env.PICKUP_ADDRESS?.trim();
  const hours = env.PICKUP_HOURS?.trim();

  if (!name || !address || !hours) {
    return null;
  }

  return {
    name,
    address,
    hours,
    instructions: env.PICKUP_INSTRUCTIONS?.trim() || null,
  };
}

export function splitPickupAddressLines(address: string): string[] {
  return address
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function getPickupAddressLines(location: PickupLocation): string[] {
  return [location.name.trim(), ...splitPickupAddressLines(location.address)].filter(Boolean);
}

/** Single-line form for contexts that cannot render line breaks, such as Stripe's submit message. */
export function formatPickupAddressInline(location: PickupLocation): string {
  return splitPickupAddressLines(location.address).join(", ");
}
