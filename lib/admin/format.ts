import type { OrderEmailDelivery, OrderEmailKind } from "@/lib/db/schema";

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

const confirmationDeliveryLabels: Record<OrderEmailDelivery["status"], string> = {
  pending: "Pending",
  processing: "Sending",
  retry: "Retry scheduled",
  sent: "Sent",
  failed: "Needs attention",
};

export function formatConfirmationDeliveryStatus(status: OrderEmailDelivery["status"]): string {
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

/**
 * Exhaustive by kind so a newly added email cannot silently inherit another kind's wording on the
 * attention queue, where the copy is what tells an operator what the customer is missing.
 */
const orderEmailKindCopy: Record<OrderEmailKind, { name: string; failureImpact: string }> = {
  confirmation: {
    name: "confirmation",
    failureImpact: "The customer has no receipt.",
  },
  pickup_ready: {
    name: "pickup",
    failureImpact: "The customer has not been told their order is ready.",
  },
  shipped: {
    name: "shipping",
    failureImpact: "The customer has not been told their order shipped.",
  },
};

export function formatOrderEmailKind(kind: OrderEmailKind): string {
  return orderEmailKindCopy[kind].name;
}

export function formatOrderEmailFailureImpact(kind: OrderEmailKind): string {
  return orderEmailKindCopy[kind].failureImpact;
}
