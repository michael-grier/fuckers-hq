/**
 * The carriers an operator can record a tracking number against.
 *
 * These values back a Postgres enum but live here rather than in the schema so the admin form and
 * the email template can import them without pulling Drizzle into a client bundle.
 */
export const shippingCarrierValues = [
  "canada_post",
  "ups",
  "fedex",
  "purolator",
  "usps",
  "dhl",
  "other",
] as const;

export type ShippingCarrier = (typeof shippingCarrierValues)[number];

/** Carriers that may be selected for a new shipment; the full enum remains for historical rows. */
export const newShipmentCarrierValues = [
  "canada_post",
] as const satisfies readonly ShippingCarrier[];

export type NewShipmentCarrier = (typeof newShipmentCarrierValues)[number];

export const canadaPostTrackingNumberError =
  "Enter a 16-digit Canada Post tracking number or a 13-character number with 2 letters, 9 digits, and CA.";

const s10Weights = [8, 6, 4, 2, 3, 5, 9, 7] as const;

/** Validates the check digit in the nine-digit numeric section of an international S10 number. */
function hasValidS10CheckDigit(serialNumber: string, checkDigit: string): boolean {
  const weightedSum = [...serialNumber].reduce(
    (sum, digit, index) => sum + Number(digit) * s10Weights[index],
    0,
  );
  const difference = 11 - (weightedSum % 11);
  const expectedCheckDigit = difference === 10 ? 0 : difference === 11 ? 5 : difference;

  return Number(checkDigit) === expectedCheckDigit;
}

/** Accepts Canada Post's 16-digit domestic PIN or checksum-valid 13-character S10 identifier. */
function isCanadaPostTrackingNumber(trackingNumber: string): boolean {
  const compactNumber = trackingNumber.replace(/[ -]/g, "").toUpperCase();

  if (/^\d{16}$/.test(compactNumber)) {
    return true;
  }

  const s10Match = compactNumber.match(/^[A-Z]{2}(\d{8})(\d)CA$/);

  return s10Match ? hasValidS10CheckDigit(s10Match[1], s10Match[2]) : false;
}

type ShippingCarrierDefinition = {
  label: string;
  /**
   * Public tracking page for a single number, or null when the carrier has no stable single-number
   * URL. A null builder makes the email render the number as plain text instead of a dead link.
   */
  buildTrackingUrl: ((trackingNumber: string) => string) | null;
  validateTrackingNumber?: (trackingNumber: string) => boolean;
};

const shippingCarriers: Record<ShippingCarrier, ShippingCarrierDefinition> = {
  canada_post: {
    label: "Canada Post",
    buildTrackingUrl: (trackingNumber) =>
      `https://www.canadapost-postescanada.ca/track-reperage/en#/resultList?searchFor=${encodeURIComponent(trackingNumber)}`,
    validateTrackingNumber: isCanadaPostTrackingNumber,
  },
  ups: {
    label: "UPS",
    buildTrackingUrl: (trackingNumber) =>
      `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`,
  },
  fedex: {
    label: "FedEx",
    buildTrackingUrl: (trackingNumber) =>
      `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`,
  },
  purolator: {
    label: "Purolator",
    buildTrackingUrl: (trackingNumber) =>
      `https://www.purolator.com/en/shipping/tracker?pin=${encodeURIComponent(trackingNumber)}`,
  },
  usps: {
    label: "USPS",
    buildTrackingUrl: (trackingNumber) =>
      `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
  },
  dhl: {
    label: "DHL",
    buildTrackingUrl: (trackingNumber) =>
      `https://www.dhl.com/ca-en/home/tracking.html?tracking-id=${encodeURIComponent(trackingNumber)}`,
  },
  other: {
    label: "Other carrier",
    buildTrackingUrl: null,
  },
};

export function getShippingCarrierLabel(carrier: ShippingCarrier): string {
  return shippingCarriers[carrier].label;
}

export function getShippingCarrierTrackingUrl(
  carrier: ShippingCarrier,
  trackingNumber: string,
): string | null {
  return shippingCarriers[carrier].buildTrackingUrl?.(trackingNumber) ?? null;
}

/** Returns the carrier-specific format error for a new tracking number, if any. */
export function getShippingCarrierTrackingNumberError(
  carrier: NewShipmentCarrier,
  trackingNumber: string,
): string | null {
  return shippingCarriers[carrier].validateTrackingNumber?.(trackingNumber)
    ? null
    : canadaPostTrackingNumberError;
}

/**
 * Whether this carrier can produce a tracking link at all, independent of any number. Lets the
 * admin form tell an operator up front that a carrier's number will render as plain text.
 */
export function carrierHasTrackingLink(carrier: ShippingCarrier): boolean {
  return shippingCarriers[carrier].buildTrackingUrl !== null;
}

/** Display-ready tracking for one order, shared by the admin surfaces and the shipped email. */
export type OrderTrackingView = {
  carrierName: string;
  trackingNumber: string;
  trackingUrl: string | null;
};

/**
 * Resolves an order's stored tracking columns into something renderable, or null when the shipment
 * has none. Takes the pair rather than a whole order so it works against any row shape that
 * selected the two columns.
 */
export function resolveOrderTracking(order: {
  trackingCarrier: ShippingCarrier | null;
  trackingNumber: string | null;
}): OrderTrackingView | null {
  // The orders_tracking_pair_complete constraint keeps these in step; this narrows both for the
  // type system and stays correct against a row that predates the constraint.
  if (!order.trackingCarrier || !order.trackingNumber) {
    return null;
  }

  return {
    carrierName: getShippingCarrierLabel(order.trackingCarrier),
    trackingNumber: order.trackingNumber,
    trackingUrl: getShippingCarrierTrackingUrl(order.trackingCarrier, order.trackingNumber),
  };
}
