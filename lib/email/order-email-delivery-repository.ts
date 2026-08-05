import "server-only";

import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { orderEmailDeliveries } from "@/lib/db/schema";
import type { OrderEmailDeliveryRepository } from "@/lib/email/order-email-delivery";

const claimableStatuses = ["pending", "retry"] as const;

export const orderEmailDeliveryRepository: OrderEmailDeliveryRepository = {
  async claimDelivery(ref, options) {
    const available = options.force
      ? or(
          inArray(orderEmailDeliveries.status, ["pending", "retry", "failed"]),
          and(
            eq(orderEmailDeliveries.status, "processing"),
            lte(orderEmailDeliveries.nextAttemptAt, options.now),
          ),
        )
      : or(
          and(
            inArray(orderEmailDeliveries.status, claimableStatuses),
            lte(orderEmailDeliveries.nextAttemptAt, options.now),
          ),
          and(
            eq(orderEmailDeliveries.status, "processing"),
            lte(orderEmailDeliveries.nextAttemptAt, options.now),
          ),
        );

    const [claim] = await getDb()
      .update(orderEmailDeliveries)
      .set({
        status: "processing",
        attemptCount: sql`${orderEmailDeliveries.attemptCount} + 1`,
        lastAttemptAt: options.now,
        nextAttemptAt: options.leaseUntil,
        updatedAt: options.now,
      })
      .where(
        and(
          eq(orderEmailDeliveries.orderId, ref.orderId),
          eq(orderEmailDeliveries.kind, ref.kind),
          available,
        ),
      )
      .returning({
        id: orderEmailDeliveries.id,
        orderId: orderEmailDeliveries.orderId,
        kind: orderEmailDeliveries.kind,
        idempotencyKey: orderEmailDeliveries.idempotencyKey,
        attemptCount: orderEmailDeliveries.attemptCount,
      });

    return claim ?? null;
  },

  async markDelivered(delivery) {
    const rows = await getDb()
      .update(orderEmailDeliveries)
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
          eq(orderEmailDeliveries.id, delivery.deliveryId),
          eq(orderEmailDeliveries.status, "processing"),
          eq(orderEmailDeliveries.attemptCount, delivery.attemptCount),
        ),
      )
      .returning({ id: orderEmailDeliveries.id });

    return rows.length === 1;
  },

  async markFailed(delivery) {
    const rows = await getDb()
      .update(orderEmailDeliveries)
      .set({
        status: delivery.terminal ? "failed" : "retry",
        nextAttemptAt: delivery.nextAttemptAt,
        lastErrorAt: delivery.failedAt,
        lastErrorCode: delivery.errorCode,
        updatedAt: delivery.failedAt,
      })
      .where(
        and(
          eq(orderEmailDeliveries.id, delivery.deliveryId),
          eq(orderEmailDeliveries.status, "processing"),
          eq(orderEmailDeliveries.attemptCount, delivery.attemptCount),
        ),
      )
      .returning({ id: orderEmailDeliveries.id });

    return rows.length === 1;
  },

  async findDueDeliveries(now, limit) {
    return getDb()
      .select({
        orderId: orderEmailDeliveries.orderId,
        kind: orderEmailDeliveries.kind,
      })
      .from(orderEmailDeliveries)
      .where(
        or(
          and(
            inArray(orderEmailDeliveries.status, claimableStatuses),
            lte(orderEmailDeliveries.nextAttemptAt, now),
          ),
          and(
            eq(orderEmailDeliveries.status, "processing"),
            lte(orderEmailDeliveries.nextAttemptAt, now),
          ),
        ),
      )
      .orderBy(asc(orderEmailDeliveries.nextAttemptAt))
      .limit(limit);
  },
};
