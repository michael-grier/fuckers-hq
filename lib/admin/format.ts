import type { OrderConfirmationDelivery } from "@/lib/db/schema";

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

export function formatOptionalAdminDate(value: Date | null): string {
  return value ? formatAdminDate(value) : "Not yet";
}

const confirmationDeliveryLabels: Record<OrderConfirmationDelivery["status"], string> = {
  pending: "Pending",
  processing: "Sending",
  retry: "Retry scheduled",
  sent: "Sent",
  failed: "Needs attention",
};

export function formatConfirmationDeliveryStatus(
  status: OrderConfirmationDelivery["status"],
): string {
  return confirmationDeliveryLabels[status];
}

const confirmationDeliveryErrorLabels: Record<string, string> = {
  configuration_error: "Email configuration",
  delivery_error: "Delivery unavailable",
  legacy_delivery_unknown: "Pre-outbox delivery unknown",
  provider_error: "Provider rejected delivery",
};

export function formatConfirmationDeliveryError(errorCode: string | null): string {
  if (!errorCode) {
    return "None";
  }

  return confirmationDeliveryErrorLabels[errorCode] ?? "Delivery unavailable";
}
