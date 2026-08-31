import "server-only";

import { and, asc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { orderEmailDeliveries, orderItems, orders, productVariants } from "@/lib/db/schema";
import { makeOrderEmailIdempotencyKey } from "@/lib/email/order-email-delivery";
import {
  assertInventoryDecremented,
  planInventoryAllocation,
} from "@/lib/orders/create-paid-order";
import type { OrderFulfillmentRepository } from "@/lib/orders/order-fulfillment";
import { orderFulfillmentTransitionRules } from "@/lib/orders/order-fulfillment";
import { returnOrderItemsToStock } from "@/lib/orders/order-inventory-repository";
import { isOrderFulfillmentEligible } from "@/lib/orders/payment-lifecycle";
import type { InventoryExceptionRepository } from "@/lib/orders/resolve-inventory-exception";
import type { OrderInventoryReturnRepository } from "@/lib/orders/return-order-inventory";

export const adminOrderRepository: OrderFulfillmentRepository &
  InventoryExceptionRepository &
  OrderInventoryReturnRepository = {
  async applyFulfillmentTransition(orderId, transition, occurredAt, shipment) {
    const rule = orderFulfillmentTransitionRules[transition];

    return getDb().transaction(async (tx) => {
      const order = await tx.query.orders.findFirst({
        columns: { stripePaymentIntentId: true },
        where: (orders, { eq }) => eq(orders.id, orderId),
      });

      if (!order) {
        return false;
      }

      if (order.stripePaymentIntentId) {
        // Serialize against refund and dispute webhooks for the same payment.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${order.stripePaymentIntentId}))`,
        );
      }

      const updatedOrders = await tx
        .update(orders)
        .set({
          status: rule.toStatus,
          // Recorded once, when the delivery is scheduled, and kept after it is dropped off.
          ...(rule.toStatus === "delivery_scheduled" ? { deliveryScheduledAt: occurredAt } : {}),
          // Written as a set so a re-shipped order cannot keep tracking from an earlier attempt.
          ...(transition === "ship"
            ? {
                shippedAt: occurredAt,
                trackingCarrier: shipment?.carrier ?? null,
                trackingNumber: shipment?.trackingNumber ?? null,
              }
            : {}),
        })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.status, rule.fromStatus),
            eq(orders.fulfillmentMethod, rule.requiredMethod),
            eq(orders.inventoryStatus, "allocated"),
            ne(orders.refundStatus, "full"),
            inArray(orders.disputeStatus, ["none", "won"]),
            transition === "ship"
              ? or(
                  isNull(orders.deliveryReviewStatus),
                  eq(orders.deliveryReviewStatus, "shipping_payment_received"),
                )
              : eq(orders.deliveryReviewStatus, "approved"),
          ),
        )
        .returning({ id: orders.id });

      if (updatedOrders.length !== 1) {
        return false;
      }

      if (rule.queuedEmailKind) {
        // Queued in the same transaction as the status change so an order can never reach a state
        // without the notification the customer needs. Delivery itself happens after commit.
        await tx
          .insert(orderEmailDeliveries)
          .values({
            orderId,
            kind: rule.queuedEmailKind,
            idempotencyKey: makeOrderEmailIdempotencyKey(orderId, rule.queuedEmailKind),
          })
          .onConflictDoNothing({
            target: [orderEmailDeliveries.orderId, orderEmailDeliveries.kind],
          });
      }

      return true;
    });
  },

  async findOrderFulfillmentState(orderId) {
    const order = await getDb().query.orders.findFirst({
      columns: {
        status: true,
        inventoryStatus: true,
        refundStatus: true,
        disputeStatus: true,
        fulfillmentMethod: true,
        deliveryReviewStatus: true,
      },
      where: (orders, { eq }) => eq(orders.id, orderId),
    });

    return order ?? null;
  },

  async allocateInventoryForException(orderId) {
    return getDb().transaction(async (tx) => {
      const paymentIdentity = await tx.query.orders.findFirst({
        columns: { stripePaymentIntentId: true },
        where: (orders, { eq }) => eq(orders.id, orderId),
      });

      if (!paymentIdentity) {
        return "not_found";
      }

      if (paymentIdentity.stripePaymentIntentId) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${paymentIdentity.stripePaymentIntentId}))`,
        );
      }

      const [order] = await tx
        .select({
          id: orders.id,
          status: orders.status,
          inventoryStatus: orders.inventoryStatus,
          refundStatus: orders.refundStatus,
          disputeStatus: orders.disputeStatus,
        })
        .from(orders)
        .where(eq(orders.id, orderId))
        .for("update");

      if (!order) {
        return "not_found";
      }

      if (!isOrderFulfillmentEligible(order)) {
        return "invalid_status";
      }

      if (order.inventoryStatus === "allocated") {
        return "already_allocated";
      }

      const items = await tx
        .select({
          variantId: orderItems.variantId,
          quantity: orderItems.quantity,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, order.id));
      const allocationLines = items.flatMap((item) =>
        item.variantId ? [{ variantId: item.variantId, quantity: item.quantity }] : [],
      );
      const variantIds = Array.from(new Set(allocationLines.map((item) => item.variantId)));

      if (items.length === 0 || allocationLines.length !== items.length) {
        return "insufficient_inventory";
      }

      const variants =
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
      const allocation = planInventoryAllocation(allocationLines, variants);

      if (allocation.status === "exception") {
        return "insufficient_inventory";
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
              gte(
                sql`${productVariants.inventoryQty} - ${productVariants.reservedQty}`,
                line.quantity,
              ),
            ),
          )
          .returning({ id: productVariants.id });

        assertInventoryDecremented(
          updatedVariants.map((variant) => variant.id),
          line,
        );
      }

      const allocatedOrders = await tx
        .update(orders)
        .set({ inventoryStatus: "allocated" })
        .where(
          and(
            eq(orders.id, order.id),
            eq(orders.status, "paid"),
            eq(orders.inventoryStatus, "exception"),
          ),
        )
        .returning({ id: orders.id });

      if (allocatedOrders.length !== 1) {
        throw new Error("Inventory exception order could not be marked allocated.");
      }

      return "allocated";
    });
  },

  async returnRefundedOrderInventory(orderId) {
    return getDb().transaction(async (tx) => {
      const paymentIdentity = await tx.query.orders.findFirst({
        columns: { stripePaymentIntentId: true },
        where: (orders, { eq }) => eq(orders.id, orderId),
      });

      if (!paymentIdentity) {
        return "not_found";
      }

      if (paymentIdentity.stripePaymentIntentId) {
        // Serialize against a refund webhook that may be deciding on the same allocated units.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${paymentIdentity.stripePaymentIntentId}))`,
        );
      }

      return returnOrderItemsToStock(tx, orderId);
    });
  },
};
