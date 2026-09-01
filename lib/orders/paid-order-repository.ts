import "server-only";

import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import {
  inventoryReservationItems,
  inventoryReservations,
  orderEmailDeliveries,
  orderItems,
  orders,
  pendingCheckouts,
  productVariants,
  stripePaymentEvents,
} from "@/lib/db/schema";
import { makeOrderEmailIdempotencyKey } from "@/lib/email/order-email-delivery";
import {
  assertInventoryDecremented,
  assertPendingCheckoutItemsMatchSnapshots,
  PaidOrderError,
  type PaidOrderWriter,
  parsePendingCheckoutLineSnapshots,
  resolveOrderItemSnapshots,
} from "@/lib/orders/create-paid-order";
import { makeOrderNumber } from "@/lib/orders/order-number";
import {
  derivePaymentLifecycleState,
  type PaymentLifecycleUpdate,
} from "@/lib/orders/payment-lifecycle";

type LockedReservation = typeof inventoryReservations.$inferSelect;
type ReservationLine = {
  variantId: string | null;
  variantIdSnapshot: string;
  quantity: number;
};

export function createPaidOrderRepository(database: Database): PaidOrderWriter {
  return {
    async createPaidOrder(checkout) {
      return database.transaction(async (tx) => {
        if (checkout.stripePaymentIntentId) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtext(${checkout.stripePaymentIntentId}))`,
          );
        }

        const existingOrder = await tx.query.orders.findFirst({
          columns: { id: true },
          where: (order, { eq }) => eq(order.stripeSessionId, checkout.stripeSessionId),
        });

        if (existingOrder) {
          return { created: false, orderId: existingOrder.id };
        }

        const [pendingCheckout] = await tx
          .select()
          .from(pendingCheckouts)
          .where(eq(pendingCheckouts.token, checkout.pendingCheckoutToken))
          .for("update");

        if (!pendingCheckout) {
          throw new PaidOrderError("Pending checkout was not found.");
        }

        if (
          pendingCheckout.stripeSessionId &&
          pendingCheckout.stripeSessionId !== checkout.stripeSessionId
        ) {
          throw new PaidOrderError("Pending checkout does not match the Stripe Session.");
        }

        if (pendingCheckout.completedAt) {
          throw new PaidOrderError("Pending checkout is completed without a matching order.");
        }

        const lineSnapshots = parsePendingCheckoutLineSnapshots(pendingCheckout.lineItems);
        assertPendingCheckoutItemsMatchSnapshots(pendingCheckout.items, lineSnapshots);
        const snapshots = resolveOrderItemSnapshots(lineSnapshots, checkout);
        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.pendingCheckoutId, pendingCheckout.id))
          .for("update");
        const reservationLines = reservation
          ? await tx
              .select({
                variantId: inventoryReservationItems.variantId,
                variantIdSnapshot: inventoryReservationItems.variantIdSnapshot,
                quantity: inventoryReservationItems.quantity,
              })
              .from(inventoryReservationItems)
              .where(eq(inventoryReservationItems.reservationId, reservation.id))
              .orderBy(asc(inventoryReservationItems.variantIdSnapshot))
          : [];
        const reservationIsUsable = isUsableReservation(
          reservation,
          reservationLines,
          snapshots,
          checkout.reservationToken,
          checkout.stripeSessionId,
        );
        const variantIds = Array.from(
          new Set([
            ...snapshots.map((snapshot) => snapshot.variantId),
            ...reservationLines.flatMap((line) => (line.variantId ? [line.variantId] : [])),
          ]),
        ).sort();
        const lockedVariants =
          variantIds.length > 0
            ? await tx
                .select({
                  id: productVariants.id,
                  inventoryQty: productVariants.inventoryQty,
                  reservedQty: productVariants.reservedQty,
                })
                .from(productVariants)
                .where(inArray(productVariants.id, variantIds))
                .orderBy(asc(productVariants.id))
                .for("update")
            : [];
        const reservationCanConvert =
          reservationIsUsable && hasConvertibleInventory(reservationLines, lockedVariants);
        const paymentEvents = checkout.stripePaymentIntentId
          ? await tx
              .select()
              .from(stripePaymentEvents)
              .where(eq(stripePaymentEvents.stripePaymentIntentId, checkout.stripePaymentIntentId))
          : [];
        const paymentState = derivePaymentLifecycleState(
          checkout.totalCents,
          checkout.currency,
          paymentEvents.map(toPaymentLifecycleUpdate),
        );
        const isFullyRefunded = paymentState.refundStatus === "full";
        const inventoryStatus = isFullyRefunded
          ? "released"
          : reservationCanConvert
            ? "allocated"
            : "exception";
        const [order] = await tx
          .insert(orders)
          .values({
            orderNumber: makeOrderNumber(),
            email: checkout.email,
            status: isFullyRefunded ? "refunded" : "paid",
            inventoryStatus,
            // Taken from the pending checkout the server wrote at reservation time, not from the
            // Stripe Session metadata that round-tripped through the browser and Stripe.
            fulfillmentMethod: pendingCheckout.fulfillmentMethod,
            deliveryReviewStatus:
              pendingCheckout.fulfillmentMethod === "delivery" ? "pending" : null,
            stripeSessionId: checkout.stripeSessionId,
            stripePaymentIntentId: checkout.stripePaymentIntentId,
            refundStatus: paymentState.refundStatus,
            refundedCents: paymentState.refundedCents,
            disputeStatus: paymentState.disputeStatus,
            subtotalCents: checkout.subtotalCents,
            taxCents: checkout.taxCents,
            shippingCents: checkout.shippingCents,
            totalCents: checkout.totalCents,
            currency: checkout.currency,
            shippingAddress: checkout.shippingAddress,
            destinationProvince: checkout.destinationProvince,
          })
          .onConflictDoNothing({ target: orders.stripeSessionId })
          .returning({ id: orders.id });

        if (!order) {
          const concurrentOrder = await tx.query.orders.findFirst({
            columns: { id: true },
            where: (order, { eq }) => eq(order.stripeSessionId, checkout.stripeSessionId),
          });

          if (!concurrentOrder) {
            throw new PaidOrderError("Unable to resolve the existing Stripe Session order.");
          }

          return { created: false, orderId: concurrentOrder.id };
        }

        if (
          isFullyRefunded &&
          reservation &&
          reservation.status !== "released" &&
          reservation.status !== "converted"
        ) {
          // A refund retained before the paid event means the reservation should be released, not
          // converted into an allocation that would immediately need to be returned.
          await releaseReservation(
            tx,
            reservation,
            reservationLines,
            "fully_refunded_before_order",
          );
        } else if (reservationCanConvert && reservation) {
          await convertReservedInventory(
            tx,
            reservation,
            reservationLines,
            checkout.stripeSessionId,
          );
        } else if (
          reservation &&
          reservation.status !== "released" &&
          reservation.status !== "converted"
        ) {
          // Preserve the verified payment even when reservation counters require operator review.
          await releaseReservation(
            tx,
            reservation,
            reservationLines,
            "paid_reservation_inconsistent",
          );
        }

        await tx.insert(orderItems).values(
          snapshots.map((snapshot) => ({
            orderId: order.id,
            ...snapshot,
          })),
        );

        await tx.insert(orderEmailDeliveries).values({
          orderId: order.id,
          kind: "confirmation",
          idempotencyKey: makeOrderEmailIdempotencyKey(order.id, "confirmation"),
        });

        const completedCheckouts = await tx
          .update(pendingCheckouts)
          .set({
            stripeSessionId: checkout.stripeSessionId,
            completedAt: new Date(),
          })
          .where(
            and(eq(pendingCheckouts.id, pendingCheckout.id), isNull(pendingCheckouts.completedAt)),
          )
          .returning({ id: pendingCheckouts.id });

        if (completedCheckouts.length !== 1) {
          throw new PaidOrderError("Pending checkout could not be marked completed.");
        }

        return { created: true, orderId: order.id };
      });
    },
  };
}

type PaidOrderTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function convertReservedInventory(
  tx: PaidOrderTransaction,
  reservation: LockedReservation,
  lines: ReservationLine[],
  stripeSessionId: string,
): Promise<void> {
  for (const line of lines) {
    if (!line.variantId) {
      throw new PaidOrderError("Reserved variant was deleted before payment.");
    }

    const updatedVariants = await tx
      .update(productVariants)
      .set({
        inventoryQty: sql`${productVariants.inventoryQty} - ${line.quantity}`,
        reservedQty: sql`${productVariants.reservedQty} - ${line.quantity}`,
      })
      .where(
        and(
          eq(productVariants.id, line.variantId),
          gte(productVariants.inventoryQty, line.quantity),
          gte(productVariants.reservedQty, line.quantity),
        ),
      )
      .returning({ id: productVariants.id });

    assertInventoryDecremented(
      updatedVariants.map((variant) => variant.id),
      { variantId: line.variantId, quantity: line.quantity },
    );
  }

  const convertedAt = new Date();
  await tx
    .update(inventoryReservationItems)
    .set({ variantId: null })
    .where(eq(inventoryReservationItems.reservationId, reservation.id));
  const converted = await tx
    .update(inventoryReservations)
    .set({
      stripeSessionId,
      status: "converted",
      convertedAt,
      reconcileLeaseUntil: null,
      lastReconcileErrorCode: null,
      updatedAt: convertedAt,
    })
    .where(
      and(
        eq(inventoryReservations.id, reservation.id),
        inArray(inventoryReservations.status, ["provisioning", "active", "awaiting_payment"]),
      ),
    )
    .returning({ id: inventoryReservations.id });

  if (converted.length !== 1) {
    throw new PaidOrderError("Inventory reservation could not be converted.");
  }
}

async function releaseReservation(
  tx: PaidOrderTransaction,
  reservation: LockedReservation,
  lines: ReservationLine[],
  reason: "fully_refunded_before_order" | "paid_reservation_inconsistent",
): Promise<void> {
  let releasedEveryLine = true;

  for (const line of lines) {
    const variantId = line.variantId ?? line.variantIdSnapshot;

    const updated = await tx
      .update(productVariants)
      .set({
        reservedQty: sql`${productVariants.reservedQty} - ${line.quantity}`,
      })
      .where(
        and(eq(productVariants.id, variantId), gte(productVariants.reservedQty, line.quantity)),
      )
      .returning({ id: productVariants.id });

    if (updated.length !== 1) {
      releasedEveryLine = false;
    }
  }

  const releasedAt = new Date();

  if (releasedEveryLine) {
    await tx
      .update(inventoryReservationItems)
      .set({ variantId: null })
      .where(eq(inventoryReservationItems.reservationId, reservation.id));
  }

  await tx
    .update(inventoryReservations)
    .set({
      status: "released",
      releasedAt,
      releaseReason: reason,
      reconcileLeaseUntil: null,
      lastReconcileErrorCode: releasedEveryLine ? null : "paid_reservation_stock_inconsistent",
      updatedAt: releasedAt,
    })
    .where(eq(inventoryReservations.id, reservation.id));
}

function isUsableReservation(
  reservation: LockedReservation | undefined,
  reservationLines: ReservationLine[],
  orderLines: Array<{ variantId: string; quantity: number }>,
  reservationToken: string | null,
  stripeSessionId: string,
): boolean {
  if (
    !reservation ||
    !reservationToken ||
    reservation.token !== reservationToken ||
    !["provisioning", "active", "awaiting_payment"].includes(reservation.status) ||
    (reservation.stripeSessionId && reservation.stripeSessionId !== stripeSessionId)
  ) {
    return false;
  }

  const expected = [...orderLines]
    .map(({ variantId, quantity }) => ({ variantId, quantity }))
    .sort((left, right) => left.variantId.localeCompare(right.variantId));
  const actual = reservationLines.map((line) => ({
    variantId: line.variantIdSnapshot,
    quantity: line.quantity,
  }));

  return (
    reservationLines.every((line) => line.variantId === line.variantIdSnapshot) &&
    JSON.stringify(actual) === JSON.stringify(expected)
  );
}

function hasConvertibleInventory(
  reservationLines: ReservationLine[],
  variants: Array<{ id: string; inventoryQty: number; reservedQty: number }>,
): boolean {
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  return reservationLines.every((line) => {
    const variant = variantsById.get(line.variantIdSnapshot);

    return (
      variant !== undefined &&
      variant.inventoryQty >= line.quantity &&
      variant.reservedQty >= line.quantity
    );
  });
}

function toPaymentLifecycleUpdate(
  event: typeof stripePaymentEvents.$inferSelect,
): PaymentLifecycleUpdate {
  return {
    stripeEventId: event.stripeEventId,
    stripePaymentIntentId: event.stripePaymentIntentId,
    kind: event.kind,
    refundedCents: event.refundedCents,
    currency: event.currency,
    disputeStatus: event.disputeStatus === "none" ? null : event.disputeStatus,
    occurredAt: event.occurredAt,
  };
}

let defaultRepository: PaidOrderWriter | undefined;

function getDefaultRepository(): PaidOrderWriter {
  defaultRepository ??= createPaidOrderRepository(getDb());
  return defaultRepository;
}

export const paidOrderRepository: PaidOrderWriter = {
  createPaidOrder: (checkout) => getDefaultRepository().createPaidOrder(checkout),
};
