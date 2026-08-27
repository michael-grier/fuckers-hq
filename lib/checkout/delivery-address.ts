const streetSuffixes: Record<string, string> = {
  AVENUE: "AVE",
  BOULEVARD: "BLVD",
  CIRCLE: "CIR",
  COURT: "CRT",
  CRESCENT: "CRES",
  DRIVE: "DR",
  GATE: "GATE",
  HIGHWAY: "HWY",
  LANE: "LANE",
  PLACE: "PL",
  POINT: "PT",
  ROAD: "RD",
  STREET: "ST",
  TERRACE: "TERR",
  TRAIL: "TR",
  WAY: "WAY",
};

export function normalizeCanadianPostalCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
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
