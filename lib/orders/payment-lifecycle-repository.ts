import "server-only";

import { eq, sql } from "drizzle-orm";

import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { orders, stripePaymentEvents } from "@/lib/db/schema";
import { returnOrderItemsToStock } from "@/lib/orders/order-inventory-repository";
import {
  derivePaymentLifecycleState,
  type PaymentLifecycleUpdate,
  type PaymentLifecycleWriter,
} from "@/lib/orders/payment-lifecycle";

/** Persists Stripe lifecycle updates and applies their inventory consequences atomically. */
export function createPaymentLifecycleRepository(database: Database): PaymentLifecycleWriter {
  return {
    async recordPaymentLifecycleUpdate(update) {
      return database.transaction(async (tx) => {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${update.stripePaymentIntentId}))`,
        );

        const insertedEvents = await tx
          .insert(stripePaymentEvents)
          .values(update)
          .onConflictDoNothing({ target: stripePaymentEvents.stripeEventId })
          .returning({ stripeEventId: stripePaymentEvents.stripeEventId });
        const order = await tx.query.orders.findFirst({
          where: (orders, { eq }) => eq(orders.stripePaymentIntentId, update.stripePaymentIntentId),
        });

        if (!order) {
          return { changed: insertedEvents.length === 1, orderId: null };
        }

        const events = await tx
          .select()
          .from(stripePaymentEvents)
          .where(eq(stripePaymentEvents.stripePaymentIntentId, update.stripePaymentIntentId));
        const state = derivePaymentLifecycleState(
          order.totalCents,
          order.currency,
          events.map(toPaymentLifecycleUpdate),
        );
        const nextOrderStatus =
          state.refundStatus === "full" && order.status === "paid" ? "refunded" : order.status;
        const shouldAutoReleaseInventory = state.refundStatus === "full" && order.status === "paid";
        const nextInventoryStatus =
          shouldAutoReleaseInventory && order.inventoryStatus === "exception"
            ? "released"
            : order.inventoryStatus;
        const stateChanged =
          order.status !== nextOrderStatus ||
          order.inventoryStatus !== nextInventoryStatus ||
          order.refundStatus !== state.refundStatus ||
          order.refundedCents !== state.refundedCents ||
          order.disputeStatus !== state.disputeStatus;

        if (stateChanged) {
          await tx
            .update(orders)
            .set({
              status: nextOrderStatus,
              inventoryStatus: nextInventoryStatus,
              refundStatus: state.refundStatus,
              refundedCents: state.refundedCents,
              disputeStatus: state.disputeStatus,
            })
            .where(eq(orders.id, order.id));
        }

        let inventoryReturned = false;

        if (shouldAutoReleaseInventory && order.inventoryStatus === "allocated") {
          // The refund state is already written in this transaction, so the shared return helper can
          // enforce the same refunded-and-allocated guard as the operator action.
          inventoryReturned = (await returnOrderItemsToStock(tx, order.id)) === "returned";
        }

        return {
          changed: insertedEvents.length === 1 || stateChanged || inventoryReturned,
          orderId: order.id,
        };
      });
    },
  };
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

let defaultRepository: PaymentLifecycleWriter | undefined;

function getDefaultRepository(): PaymentLifecycleWriter {
  defaultRepository ??= createPaymentLifecycleRepository(getDb());
  return defaultRepository;
}

export const paymentLifecycleRepository: PaymentLifecycleWriter = {
  recordPaymentLifecycleUpdate: (update) =>
    getDefaultRepository().recordPaymentLifecycleUpdate(update),
};
