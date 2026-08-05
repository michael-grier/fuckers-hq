const adminDateFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export function formatAdminDate(date: Date): string {
  return `${adminDateFormatter.format(date)} UTC`;
}

const adminDayFormatter = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/**
 * Day-only UTC date for dense lists, where the full timestamp crowds out the
 * data an operator actually scans. Pair with `formatAdminDate` in a `title` so
 * the exact time stays reachable.
 */
export function formatAdminDay(date: Date): string {
  return adminDayFormatter.format(date);
}
