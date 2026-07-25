import "server-only";

import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { createCheckoutRepository, releaseReservation } from "@/lib/checkout/repository";
import type {
  ReservationReconciliationClaim,
  ReservationReconciliationRepository,
} from "@/lib/checkout/reservation-reconciliation";
import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { inventoryReservations } from "@/lib/db/schema";

const claimableStatuses = ["provisioning", "active", "awaiting_payment"] as const;

export function createReservationReconciliationRepository(
  database: Database,
): ReservationReconciliationRepository {
  const checkout = createCheckoutRepository(database);

  return {
    async findDueReservationTokens(now, limit) {
      const rows = await database
        .select({ token: inventoryReservations.token })
        .from(inventoryReservations)
        .where(
          and(
            inArray(inventoryReservations.status, claimableStatuses),
            lte(inventoryReservations.nextReconcileAt, now),
            or(
              isNull(inventoryReservations.reconcileLeaseUntil),
              lte(inventoryReservations.reconcileLeaseUntil, now),
            ),
          ),
        )
        .orderBy(asc(inventoryReservations.nextReconcileAt))
        .limit(limit);

      return rows.map((row) => row.token);
    },

    async claimReservation(token, now, leaseUntil) {
      return database.transaction(async (tx) => {
        const [claim] = await tx
          .update(inventoryReservations)
          .set({
            reconcileLeaseUntil: leaseUntil,
            reconcileAttemptCount: sql`${inventoryReservations.reconcileAttemptCount} + 1`,
            updatedAt: now,
          })
          .where(
            and(
              eq(inventoryReservations.token, token),
              inArray(inventoryReservations.status, claimableStatuses),
              lte(inventoryReservations.nextReconcileAt, now),
              or(
                isNull(inventoryReservations.reconcileLeaseUntil),
                lte(inventoryReservations.reconcileLeaseUntil, now),
              ),
            ),
          )
          .returning({
            id: inventoryReservations.id,
            token: inventoryReservations.token,
            pendingCheckoutId: inventoryReservations.pendingCheckoutId,
            stripeCreateIdempotencyKey: inventoryReservations.stripeCreateIdempotencyKey,
            stripeSessionId: inventoryReservations.stripeSessionId,
            stripeSessionParams: inventoryReservations.stripeSessionParams,
            status: inventoryReservations.status,
            expiresAt: inventoryReservations.expiresAt,
            createdAt: inventoryReservations.createdAt,
            attemptCount: inventoryReservations.reconcileAttemptCount,
          });

        if (!claim || !isClaimableStatus(claim.status)) {
          return null;
        }

        const pendingCheckout = await tx.query.pendingCheckouts.findFirst({
          columns: { token: true },
          where: (checkouts, { eq }) => eq(checkouts.id, claim.pendingCheckoutId),
        });

        if (!pendingCheckout) {
          throw new Error("Reservation pending checkout was not found.");
        }

        return {
          id: claim.id,
          token: claim.token,
          pendingCheckoutToken: pendingCheckout.token,
          stripeCreateIdempotencyKey: claim.stripeCreateIdempotencyKey,
          stripeSessionId: claim.stripeSessionId,
          stripeSessionParams: claim.stripeSessionParams,
          status: claim.status,
          expiresAt: claim.expiresAt,
          createdAt: claim.createdAt,
          attemptCount: claim.attemptCount,
        };
      });
    },

    linkStripeSession: checkout.linkStripeSession,

    async markAwaitingPayment(claim, stripeSessionId, nextReconcileAt) {
      const rows = await database
        .update(inventoryReservations)
        .set({
          stripeSessionId,
          status: "awaiting_payment",
          nextReconcileAt,
          reconcileLeaseUntil: null,
          lastReconcileErrorCode: null,
          updatedAt: new Date(),
        })
        .where(claimIsCurrent(claim))
        .returning({ id: inventoryReservations.id });

      return rows.length === 1;
    },

    async releaseReservation(claim, stripeSessionId, reason, releasedAt) {
      return releaseReservation(database, claim.token, stripeSessionId, {
        reason,
        releasedAt,
        allowedStatuses: ["provisioning", "active", "awaiting_payment"],
        pendingCheckoutToken: claim.pendingCheckoutToken,
      });
    },

    async deferReservation(claim, nextReconcileAt, errorCode) {
      const rows = await database
        .update(inventoryReservations)
        .set({
          nextReconcileAt,
          reconcileLeaseUntil: null,
          lastReconcileErrorCode: errorCode,
          updatedAt: new Date(),
        })
        .where(claimIsCurrent(claim))
        .returning({ id: inventoryReservations.id });

      return rows.length === 1;
    },
  };
}

function claimIsCurrent(claim: ReservationReconciliationClaim) {
  return and(
    eq(inventoryReservations.id, claim.id),
    eq(inventoryReservations.reconcileAttemptCount, claim.attemptCount),
    inArray(inventoryReservations.status, claimableStatuses),
  );
}

function isClaimableStatus(
  status: typeof inventoryReservations.$inferSelect.status,
): status is ReservationReconciliationClaim["status"] {
  return status === "provisioning" || status === "active" || status === "awaiting_payment";
}

let defaultRepository: ReservationReconciliationRepository | undefined;

export function getReservationReconciliationRepository(): ReservationReconciliationRepository {
  defaultRepository ??= createReservationReconciliationRepository(getDb());
  return defaultRepository;
}
