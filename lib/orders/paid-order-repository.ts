import "server-only";

import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import {
  orderConfirmationDeliveries,
  orderItems,
  orders,
  pendingCheckouts,
  productVariants,
  stripePaymentEvents,
} from "@/lib/db/schema";
import { makeOrderConfirmationIdempotencyKey } from "@/lib/email/order-confirmation-delivery";
import {
  assertInventoryDecremented,
  assertPendingCheckoutItemsMatchSnapshots,
  PaidOrderError,
  type PaidOrderWriter,
  parsePendingCheckoutLineSnapshots,
  planInventoryAllocation,
  resolveOrderItemSnapshots,
} from "@/lib/orders/create-paid-order";
import { makeOrderNumber } from "@/lib/orders/order-number";
import {
  derivePaymentLifecycleState,
  type PaymentLifecycleUpdate,
} from "@/lib/orders/payment-lifecycle";

export const paidOrderRepository: PaidOrderWriter = {
  async createPaidOrder(checkout) {
    return getDb().transaction(async (tx) => {
      if (checkout.stripePaymentIntentId) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${checkout.stripePaymentIntentId}))`,
        );
      }

      const existingOrder = await tx.query.orders.findFirst({
        columns: { id: true },
        where: (orders, { eq }) => eq(orders.stripeSessionId, checkout.stripeSessionId),
      });

      if (existingOrder) {
        return { created: false, orderId: existingOrder.id };
      }

      const pendingCheckout = await tx.query.pendingCheckouts.findFirst({
        where: (pendingCheckouts, { eq }) =>
          eq(pendingCheckouts.token, checkout.pendingCheckoutToken),
      });

      if (!pendingCheckout) {
        throw new PaidOrderError("Pending checkout was not found.");
      }

      if (pendingCheckout.stripeSessionId !== checkout.stripeSessionId) {
        throw new PaidOrderError("Pending checkout does not match the Stripe Session.");
      }

      if (pendingCheckout.completedAt) {
        throw new PaidOrderError("Pending checkout is completed without a matching order.");
      }

      const lineSnapshots = parsePendingCheckoutLineSnapshots(pendingCheckout.lineItems);
      assertPendingCheckoutItemsMatchSnapshots(pendingCheckout.items, lineSnapshots);
      const snapshots = resolveOrderItemSnapshots(lineSnapshots, checkout);
      const variantIds = snapshots.map((snapshot) => snapshot.variantId);
      const variants = await tx
        .select({
          id: productVariants.id,
          inventoryQty: productVariants.inventoryQty,
        })
        .from(productVariants)
        .where(inArray(productVariants.id, variantIds))
        .orderBy(asc(productVariants.id))
        .for("update");
      const allocation = planInventoryAllocation(snapshots, variants);
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
      const [order] = await tx
        .insert(orders)
        .values({
          orderNumber: makeOrderNumber(),
          email: checkout.email,
          status: paymentState.refundStatus === "full" ? "refunded" : "paid",
          inventoryStatus: allocation.status,
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
        })
        .onConflictDoNothing({ target: orders.stripeSessionId })
        .returning({ id: orders.id });

      if (!order) {
        const concurrentOrder = await tx.query.orders.findFirst({
          columns: { id: true },
          where: (orders, { eq }) => eq(orders.stripeSessionId, checkout.stripeSessionId),
        });

        if (!concurrentOrder) {
          throw new PaidOrderError("Unable to resolve the existing Stripe Session order.");
        }

        return { created: false, orderId: concurrentOrder.id };
      }

      for (const line of allocation.lines) {
        const updatedVariants = await tx
          .update(productVariants)
          .set({
            inventoryQty: sql`${productVariants.inventoryQty} - ${line.quantity}`,
          })
          .where(
            and(
              eq(productVariants.id, line.variantId),
              gte(productVariants.inventoryQty, line.quantity),
            ),
          )
          .returning({ id: productVariants.id });

        assertInventoryDecremented(
          updatedVariants.map((variant) => variant.id),
          line,
        );
      }

      await tx.insert(orderItems).values(
        snapshots.map((snapshot) => ({
          orderId: order.id,
          ...snapshot,
        })),
      );

      await tx.insert(orderConfirmationDeliveries).values({
        orderId: order.id,
        idempotencyKey: makeOrderConfirmationIdempotencyKey(order.id),
      });

      const completedCheckouts = await tx
        .update(pendingCheckouts)
        .set({ completedAt: new Date() })
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
