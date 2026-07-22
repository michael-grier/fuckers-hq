import "server-only";

import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { orderConfirmationDeliveries } from "@/lib/db/schema";
import type { OrderConfirmationDeliveryRepository } from "@/lib/email/order-confirmation-delivery";

const claimableStatuses = ["pending", "retry"] as const;

export const orderConfirmationDeliveryRepository: OrderConfirmationDeliveryRepository = {
  async claimDelivery(orderId, options) {
    const available = options.force
      ? or(
          inArray(orderConfirmationDeliveries.status, ["pending", "retry", "failed"]),
          and(
            eq(orderConfirmationDeliveries.status, "processing"),
            lte(orderConfirmationDeliveries.nextAttemptAt, options.now),
          ),
        )
      : or(
          and(
            inArray(orderConfirmationDeliveries.status, claimableStatuses),
            lte(orderConfirmationDeliveries.nextAttemptAt, options.now),
          ),
          and(
            eq(orderConfirmationDeliveries.status, "processing"),
            lte(orderConfirmationDeliveries.nextAttemptAt, options.now),
          ),
        );

    const [claim] = await getDb()
      .update(orderConfirmationDeliveries)
      .set({
        status: "processing",
        attemptCount: sql`${orderConfirmationDeliveries.attemptCount} + 1`,
        lastAttemptAt: options.now,
        nextAttemptAt: options.leaseUntil,
        updatedAt: options.now,
      })
      .where(and(eq(orderConfirmationDeliveries.orderId, orderId), available))
      .returning({
        id: orderConfirmationDeliveries.id,
        orderId: orderConfirmationDeliveries.orderId,
        idempotencyKey: orderConfirmationDeliveries.idempotencyKey,
        attemptCount: orderConfirmationDeliveries.attemptCount,
      });

    return claim ?? null;
  },

  async markDelivered(delivery) {
    const rows = await getDb()
      .update(orderConfirmationDeliveries)
      .set({
        status: "sent",
        providerMessageId: delivery.providerMessageId,
        deliveredAt: delivery.deliveredAt,
        nextAttemptAt: delivery.deliveredAt,
        lastErrorAt: null,
        lastErrorCode: null,
        updatedAt: delivery.deliveredAt,
      })
      .where(
        and(
          eq(orderConfirmationDeliveries.id, delivery.deliveryId),
          eq(orderConfirmationDeliveries.status, "processing"),
          eq(orderConfirmationDeliveries.attemptCount, delivery.attemptCount),
        ),
      )
      .returning({ id: orderConfirmationDeliveries.id });

    return rows.length === 1;
  },

  async markFailed(delivery) {
    const rows = await getDb()
      .update(orderConfirmationDeliveries)
      .set({
        status: delivery.terminal ? "failed" : "retry",
        nextAttemptAt: delivery.nextAttemptAt,
        lastErrorAt: delivery.failedAt,
        lastErrorCode: delivery.errorCode,
        updatedAt: delivery.failedAt,
      })
      .where(
        and(
          eq(orderConfirmationDeliveries.id, delivery.deliveryId),
          eq(orderConfirmationDeliveries.status, "processing"),
          eq(orderConfirmationDeliveries.attemptCount, delivery.attemptCount),
        ),
      )
      .returning({ id: orderConfirmationDeliveries.id });

    return rows.length === 1;
  },

  async findDueOrderIds(now, limit) {
    const rows = await getDb()
      .select({ orderId: orderConfirmationDeliveries.orderId })
      .from(orderConfirmationDeliveries)
      .where(
        or(
          and(
            inArray(orderConfirmationDeliveries.status, claimableStatuses),
            lte(orderConfirmationDeliveries.nextAttemptAt, now),
          ),
          and(
            eq(orderConfirmationDeliveries.status, "processing"),
            lte(orderConfirmationDeliveries.nextAttemptAt, now),
          ),
        ),
      )
      .orderBy(asc(orderConfirmationDeliveries.nextAttemptAt))
      .limit(limit);

    return rows.map((row) => row.orderId);
  },
};
