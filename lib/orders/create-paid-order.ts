import type { PendingCheckoutLineSnapshot } from "@/lib/db/schema";
import type { DestinationProvince } from "@/lib/orders/destination-province";
import { cartSchema } from "@/lib/validators/cart";
import { pendingCheckoutLineSnapshotsSchema } from "@/lib/validators/pending-checkout";

export type PaidCheckoutData = {
  pendingCheckoutToken: string;
  reservationToken: string | null;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  email: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  currency: string;
  shippingAddress: Record<string, unknown> | null;
  destinationProvince: DestinationProvince | null;
};

export type InventorySnapshotVariant = {
  id: string;
  inventoryQty: number;
  reservedQty?: number;
};

export type OrderItemSnapshot = {
  variantId: string;
  productNameSnapshot: string;
  variantNameSnapshot: string;
  unitPriceCentsSnapshot: number;
  quantity: number;
};

export type CreatePaidOrderResult = {
  created: boolean;
  orderId: string;
};

export type PaidOrderWriter = {
  createPaidOrder: (checkout: PaidCheckoutData) => Promise<CreatePaidOrderResult>;
};

export type InventoryAllocationPlan =
  | {
      status: "allocated";
      lines: Array<{ variantId: string; quantity: number }>;
    }
  | {
      status: "exception";
      lines: [];
    };

export class PaidOrderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaidOrderError";
  }
}

export class InventoryUnavailableError extends PaidOrderError {
  constructor(variantId: string, quantity: number) {
    super(`Inventory is no longer available for variant ${variantId} at quantity ${quantity}.`);
    this.name = "InventoryUnavailableError";
  }
}

export function parsePendingCheckoutLineSnapshots(input: unknown): PendingCheckoutLineSnapshot[] {
  if (input === null || input === undefined) {
    throw new PaidOrderError(
      "Pending checkout predates immutable line snapshots and requires reconciliation.",
    );
  }

  const parsed = pendingCheckoutLineSnapshotsSchema.safeParse(input);

  if (!parsed.success) {
    throw new PaidOrderError("Pending checkout has invalid immutable line snapshots.");
  }

  return parsed.data;
}

export function assertPendingCheckoutItemsMatchSnapshots(
  input: unknown,
  lineSnapshots: PendingCheckoutLineSnapshot[],
): void {
  const parsedItems = cartSchema.safeParse(input);

  if (!parsedItems.success) {
    throw new PaidOrderError("Pending checkout has invalid cart items.");
  }

  const quantitiesByVariantId = new Map<string, number>();

  for (const item of parsedItems.data) {
    quantitiesByVariantId.set(
      item.variantId,
      (quantitiesByVariantId.get(item.variantId) ?? 0) + item.quantity,
    );
  }

  if (
    quantitiesByVariantId.size !== lineSnapshots.length ||
    lineSnapshots.some((line) => quantitiesByVariantId.get(line.variantId) !== line.quantity)
  ) {
    throw new PaidOrderError("Pending checkout cart items do not match its line snapshots.");
  }
}

export function resolveOrderItemSnapshots(
  lineSnapshots: PendingCheckoutLineSnapshot[],
  checkout: Pick<PaidCheckoutData, "currency" | "subtotalCents">,
): OrderItemSnapshot[] {
  let snapshotSubtotalCents = 0;

  for (const line of lineSnapshots) {
    if (line.currency !== checkout.currency) {
      throw new PaidOrderError("Pending checkout line currency does not match the Stripe Session.");
    }

    snapshotSubtotalCents += line.unitPriceCents * line.quantity;
  }

  if (
    !Number.isSafeInteger(snapshotSubtotalCents) ||
    snapshotSubtotalCents !== checkout.subtotalCents
  ) {
    throw new PaidOrderError("Pending checkout line subtotal does not match the Stripe Session.");
  }

  return lineSnapshots.map((line) => ({
    variantId: line.variantId,
    productNameSnapshot: line.productName,
    variantNameSnapshot: line.variantName,
    unitPriceCentsSnapshot: line.unitPriceCents,
    quantity: line.quantity,
  }));
}

export function planInventoryAllocation(
  orderItems: Array<Pick<OrderItemSnapshot, "variantId" | "quantity">>,
  variants: InventorySnapshotVariant[],
): InventoryAllocationPlan {
  const requiredByVariantId = new Map<string, number>();

  for (const item of orderItems) {
    requiredByVariantId.set(
      item.variantId,
      (requiredByVariantId.get(item.variantId) ?? 0) + item.quantity,
    );
  }

  const inventoryByVariantId = new Map(
    variants.map((variant) => [variant.id, variant.inventoryQty - (variant.reservedQty ?? 0)]),
  );
  const lines = Array.from(requiredByVariantId, ([variantId, quantity]) => ({
    variantId,
    quantity,
  })).sort((left, right) => left.variantId.localeCompare(right.variantId));
  const canAllocateEveryLine = lines.every(
    (line) => (inventoryByVariantId.get(line.variantId) ?? -1) >= line.quantity,
  );

  return canAllocateEveryLine ? { status: "allocated", lines } : { status: "exception", lines: [] };
}

export function assertInventoryDecremented(
  updatedVariantIds: string[],
  line: Pick<OrderItemSnapshot, "variantId" | "quantity">,
): void {
  if (updatedVariantIds.length !== 1 || updatedVariantIds[0] !== line.variantId) {
    throw new InventoryUnavailableError(line.variantId, line.quantity);
  }
}
