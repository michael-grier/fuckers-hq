import {
  normalizeCanadianPostalCode,
  normalizeDeliveryStreetAddress,
  parseDeliveryStreetAddress,
} from "@/lib/checkout/delivery-address";
import type { GeoPoint } from "@/lib/checkout/delivery-radius";
import type { DeliveryAddress } from "@/lib/validators/delivery";

const nationalGeocoderService = "https://www.geolocator.api.geo.ca/geolocation/en/locate";
const rockyViewAddressService =
  "https://atlasmap.rockyview.ca/arcgis/rest/services/Land/MunicipalAddresses/MapServer/0/query";
const geocoderTimeoutMs = 3_000;
const nationalStreetType = "ca.gc.nrcan.geoloc.data.model.Street";

const nationalGeocoderTokens: Record<string, string> = {
  AVE: "AVENUE",
  BLVD: "BOULEVARD",
  CIR: "CIRCLE",
  CRES: "CRESCENT",
  CRT: "COURT",
  DR: "DRIVE",
  E: "EAST",
  HWY: "HIGHWAY",
  N: "NORTH",
  NE: "NORTHEAST",
  NW: "NORTHWEST",
  PL: "PLACE",
  PT: "POINT",
  RD: "ROAD",
  S: "SOUTH",
  SE: "SOUTHEAST",
  ST: "STREET",
  SW: "SOUTHWEST",
  TERR: "TERRACE",
  TR: "TRAIL",
  W: "WEST",
};

export type DeliveryGeocodeResult =
  | { status: "match"; point: GeoPoint; confidence: "high" | "low" }
  | { status: "not_found" }
  | { status: "unavailable" };

type GeocoderFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

type NationalGeocoderResult = {
  title?: unknown;
  qualifier?: unknown;
  type?: unknown;
  geometry?: { type?: unknown; coordinates?: unknown };
};

type ArcGisAddressFeature = {
  attributes?: {
    vchAddress?: unknown;
    vchPostalCode?: unknown;
    AddressStatus?: unknown;
  };
  geometry?: { x?: unknown; y?: unknown };
};

/** Geocodes Canadian addresses, with Rocky View's civic index as a rural-address fallback. */
export async function geocodeDeliveryAddress(
  address: DeliveryAddress,
  fetcher: GeocoderFetch = fetch,
): Promise<DeliveryGeocodeResult> {
  const nationalResult = await geocodeNationalAddress(address, fetcher);

  if (nationalResult.status === "match") {
    return nationalResult;
  }

  const rockyViewResult = await geocodeRockyViewAddress(address, fetcher);

  if (rockyViewResult.status === "match") {
    return rockyViewResult;
  }

  return nationalResult.status === "unavailable" || rockyViewResult.status === "unavailable"
    ? { status: "unavailable" }
    : { status: "not_found" };
}

/** Queries Natural Resources Canada's address locator without writing customer data to logs. */
async function geocodeNationalAddress(
  address: DeliveryAddress,
  fetcher: GeocoderFetch,
): Promise<DeliveryGeocodeResult> {
  const street = parseDeliveryStreetAddress(address.line1).line1;
  const queryStreet = normalizeDeliveryStreetAddress(street)
    .split(" ")
    .map((part) => nationalGeocoderTokens[part] ?? part)
    .join(" ");
  const url = new URL(nationalGeocoderService);
  url.searchParams.set(
    "q",
    `${queryStreet}, ${formatCanadianPostalCode(address.postalCode)}, Alberta`,
  );

  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(geocoderTimeoutMs) });

    if (!response.ok) {
      return { status: "unavailable" };
    }

    const body: unknown = await response.json();

    if (!Array.isArray(body)) {
      return { status: "unavailable" };
    }

    const matches = body.flatMap((candidate: unknown) => {
      if (!isNationalGeocoderResult(candidate)) {
        return [];
      }

      const candidateStreet =
        typeof candidate.title === "string" ? candidate.title.split(",", 1)[0]?.trim() : null;
      const coordinates = candidate.geometry?.coordinates;

      if (
        candidate.type !== nationalStreetType ||
        candidate.qualifier !== "INTERPOLATED_POSITION" ||
        !candidateStreet ||
        normalizeDeliveryStreetAddress(candidateStreet) !==
          normalizeDeliveryStreetAddress(street) ||
        candidate.geometry?.type !== "Point" ||
        !isGeoPoint(coordinates)
      ) {
        return [];
      }

      return [coordinates];
    });

    if (matches.length === 0) {
      return { status: "not_found" };
    }

    return {
      status: "match",
      point: matches[0],
      confidence: matches.length === 1 ? "high" : "low",
    };
  } catch {
    return { status: "unavailable" };
  }
}

/** Queries Rocky View's civic index when the national locator cannot resolve a rural address. */
async function geocodeRockyViewAddress(
  address: DeliveryAddress,
  fetcher: GeocoderFetch,
): Promise<DeliveryGeocodeResult> {
  // Tokens and direct callers can still supply an older unit-first address shape even though the
  // request schema now canonicalizes it.
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

function formatCanadianPostalCode(postalCode: string): string {
  return `${postalCode.slice(0, 3)} ${postalCode.slice(3)}`;
}

function isGeoPoint(value: unknown): value is GeoPoint {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1]) &&
    Math.abs(value[0]) <= 180 &&
    Math.abs(value[1]) <= 90
  );
}

function isNationalGeocoderResult(value: unknown): value is NationalGeocoderResult {
  return typeof value === "object" && value !== null;
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
