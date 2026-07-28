import { randomBytes } from "node:crypto";

function formatDateSegment(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

export function makeOrderNumber(
  date = new Date(),
  entropy = randomBytes(4).toString("hex"),
): string {
  return `FHQ-${formatDateSegment(date)}-${entropy.toUpperCase()}`;
}
