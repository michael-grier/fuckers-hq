const streetSuffixes: Record<string, string> = {
  AV: "AVE",
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  CIRCLE: "CIR",
  CT: "CRT",
  COURT: "CRT",
  CRESCENT: "CRES",
  DRIVE: "DR",
  DRV: "DR",
  GATE: "GATE",
  HIGHWAY: "HWY",
  LANE: "LANE",
  LN: "LANE",
  PLACE: "PL",
  POINT: "PT",
  ROAD: "RD",
  STREET: "ST",
  TER: "TERR",
  TERRACE: "TERR",
  TRAIL: "TR",
  TRL: "TR",
  WAY: "WAY",
};

const labelledUnitPattern = /^(?:AP(?:T\.?|ARTMENT)|SUITE|UNIT|#)\s*#?\s*([^,]+),\s*(.+)$/i;
const separatedUnitPattern =
  /^(?:(?:AP(?:T\.?|ARTMENT)|SUITE|UNIT)\s*#?\s*)?([A-Z0-9]+)\s*[-/]\s*(\d{1,7}\b.*)$/i;

export type DeliveryStreetParts = {
  line1: string;
  unit?: string;
};

export function normalizeCanadianPostalCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Separates an apartment prefix and ignores pasted locality text before geocoding. */
export function parseDeliveryStreetAddress(value: string): DeliveryStreetParts {
  let streetWithLocality = value.trim();
  let unit: string | undefined;
  const labelledUnit = streetWithLocality.match(labelledUnitPattern);
  const separatedUnit = streetWithLocality.match(separatedUnitPattern);

  if (labelledUnit) {
    unit = normalizeDeliveryUnit(labelledUnit[1]);
    streetWithLocality = labelledUnit[2];
  } else if (separatedUnit) {
    unit = normalizeDeliveryUnit(separatedUnit[1]);
    streetWithLocality = separatedUnit[2];
  }

  const line1 = streetWithLocality.split(",", 1)[0]?.trim() ?? "";

  return {
    line1,
    ...(unit ? { unit } : {}),
  };
}

/** Removes labels while preserving the shopper's apartment or suite identifier. */
export function normalizeDeliveryUnit(value: string): string {
  return value
    .trim()
    .replace(/^(?:AP(?:T\.?|ARTMENT)|SUITE|UNIT)\s*#?\s*/i, "")
    .replace(/^#\s*/, "")
    .trim();
}

/** Normalizes unit labels and punctuation for comparisons with Stripe address line two. */
export function normalizeDeliveryUnitForMatch(value: string): string {
  return normalizeDeliveryUnit(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Canonicalizes common street suffixes so the municipal and Stripe addresses compare reliably. */
export function normalizeDeliveryStreetAddress(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => streetSuffixes[part] ?? part)
    .join(" ");
}
