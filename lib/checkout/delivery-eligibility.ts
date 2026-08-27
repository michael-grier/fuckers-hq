import { LOCAL_DELIVERY_MINIMUM_CENTS } from "@/lib/checkout/delivery";
import type { DeliveryGeocodeResult } from "@/lib/checkout/delivery-geocoder";
import {
  distanceFromCalgaryCenterMeters,
  LOCAL_DELIVERY_RADIUS_METERS,
} from "@/lib/checkout/delivery-radius";
import type {
  DeliveryEligibilityRequest,
  DeliveryEligibilityResponse,
} from "@/lib/validators/delivery";

export const DELIVERY_RADIUS_REVIEW_DISTANCE_METERS = 250;

type DeliveryEligibilityDependencies = {
  getSubtotalCents: (items: DeliveryEligibilityRequest["items"]) => Promise<number>;
  geocode: (address: DeliveryEligibilityRequest["address"]) => Promise<DeliveryGeocodeResult>;
  createToken: (address: DeliveryEligibilityRequest["address"], reviewRequired: boolean) => string;
};

/** Evaluates price before geocoding, then treats provider trouble as a shipping-only fallback. */
export async function evaluateDeliveryEligibility(
  input: DeliveryEligibilityRequest,
  dependencies: DeliveryEligibilityDependencies,
): Promise<DeliveryEligibilityResponse> {
  const subtotalCents = await dependencies.getSubtotalCents(input.items);

  if (subtotalCents < LOCAL_DELIVERY_MINIMUM_CENTS) {
    return {
      status: "below_minimum",
      subtotalCents,
      minimumCents: LOCAL_DELIVERY_MINIMUM_CENTS,
      message: "Add more to reach the $30 minimum for free local delivery.",
    };
  }

  const result = await dependencies.geocode(input.address);

  if (result.status === "unavailable") {
    return {
      status: "unavailable",
      message: "We couldn't check local delivery right now. Shipping is still available.",
    };
  }

  if (result.status === "not_found") {
    return {
      status: "ineligible",
      message: "This address is outside our free local delivery area. Shipping is still available.",
    };
  }

  const distanceMeters = distanceFromCalgaryCenterMeters(result.point);
  const isInside = distanceMeters <= LOCAL_DELIVERY_RADIUS_METERS;
  const isNearBoundary =
    Math.abs(distanceMeters - LOCAL_DELIVERY_RADIUS_METERS) <=
    DELIVERY_RADIUS_REVIEW_DISTANCE_METERS;

  if (!isInside && !isNearBoundary) {
    return {
      status: "ineligible",
      message: "This address is outside our free local delivery area. Shipping is still available.",
    };
  }

  const reviewRequired = result.confidence === "low" || isNearBoundary;

  return {
    status: "eligible",
    token: dependencies.createToken(input.address, reviewRequired),
    address: input.address,
    reviewRequired,
    message: reviewRequired
      ? "Free local delivery is available. We'll confirm this address before scheduling."
      : "Free local delivery is available for this address.",
  };
}
