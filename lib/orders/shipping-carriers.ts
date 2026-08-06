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

type ShippingCarrierDefinition = {
  label: string;
  /**
   * Public tracking page for a single number, or null when the carrier has no stable single-number
   * URL. A null builder makes the email render the number as plain text instead of a dead link.
   */
  buildTrackingUrl: ((trackingNumber: string) => string) | null;
};

const shippingCarriers: Record<ShippingCarrier, ShippingCarrierDefinition> = {
  canada_post: {
    label: "Canada Post",
    buildTrackingUrl: (trackingNumber) =>
      `https://www.canadapost-postescanada.ca/track-reperage/en#/resultList?searchFor=${encodeURIComponent(trackingNumber)}`,
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
