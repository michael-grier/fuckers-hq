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
