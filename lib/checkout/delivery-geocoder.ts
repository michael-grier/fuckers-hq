import {
  normalizeCanadianPostalCode,
  normalizeDeliveryStreetAddress,
  parseDeliveryStreetAddress,
} from "@/lib/checkout/delivery-address";
import type { GeoPoint } from "@/lib/checkout/delivery-boundary";
import type { DeliveryAddress } from "@/lib/validators/delivery";

const rockyViewAddressService =
  "https://atlasmap.rockyview.ca/arcgis/rest/services/Land/MunicipalAddresses/MapServer/0/query";
const geocoderTimeoutMs = 3_000;

export type DeliveryGeocodeResult =
  | { status: "match"; point: GeoPoint; confidence: "high" | "low" }
  | { status: "not_found" }
  | { status: "unavailable" };

type GeocoderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type ArcGisAddressFeature = {
  attributes?: {
    vchAddress?: unknown;
    vchPostalCode?: unknown;
    AddressStatus?: unknown;
  };
  geometry?: { x?: unknown; y?: unknown };
};

/** Queries Rocky View's municipal-address index without sending customer data to application logs. */
export async function geocodeRockyViewAddress(
  address: DeliveryAddress,
  fetcher: GeocoderFetch = fetch,
): Promise<DeliveryGeocodeResult> {
  // Keep this defensive even though the request schema canonicalizes the line. Tokens and direct
  // callers can still supply an older unit-first address shape.
  const street = parseDeliveryStreetAddress(address.line1).line1;
  const houseNumber = street.match(/^\s*(\d{1,7})\b/)?.[1];

  if (!houseNumber) {
    return { status: "not_found" };
  }

  const url = new URL(rockyViewAddressService);
  url.searchParams.set("where", `intHouseNum=${houseNumber}`);
  url.searchParams.set("outFields", "vchAddress,vchPostalCode,AddressStatus");
  url.searchParams.set("returnGeometry", "true");
  url.searchParams.set("outSR", "4326");
  url.searchParams.set("f", "json");

  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(geocoderTimeoutMs) });

    if (!response.ok) {
      return { status: "unavailable" };
    }

    const body: unknown = await response.json();

    if (!isArcGisResponse(body) || body.error) {
      return { status: "unavailable" };
    }

    const matches = body.features.flatMap((feature) => {
      const candidateAddress = feature.attributes?.vchAddress;
      const longitude = feature.geometry?.x;
      const latitude = feature.geometry?.y;

      if (
        typeof candidateAddress !== "string" ||
        normalizeDeliveryStreetAddress(candidateAddress) !==
          normalizeDeliveryStreetAddress(street) ||
        typeof longitude !== "number" ||
        typeof latitude !== "number"
      ) {
        return [];
      }

      const candidatePostalCode = feature.attributes?.vchPostalCode;
      const isCurrent = feature.attributes?.AddressStatus === "Current";
      const postalCodeMatches =
        typeof candidatePostalCode === "string" &&
        normalizeCanadianPostalCode(candidatePostalCode) === address.postalCode;

      return [
        {
          point: [longitude, latitude] as GeoPoint,
          exact: postalCodeMatches && isCurrent,
        },
      ];
    });

    if (matches.length === 0) {
      return { status: "not_found" };
    }

    return {
      status: "match",
      point: matches[0].point,
      confidence: matches.length === 1 && matches[0].exact ? "high" : "low",
    };
  } catch {
    return { status: "unavailable" };
  }
}

function isArcGisResponse(
  value: unknown,
): value is { features: ArcGisAddressFeature[]; error?: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "features" in value &&
    Array.isArray(value.features)
  );
}
