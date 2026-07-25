import "server-only";

import { and, eq } from "drizzle-orm";
import { releaseReservation } from "@/lib/checkout/repository";
import type { ReservationEventWriter } from "@/lib/checkout/reservation-events";
import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import { inventoryReservations, pendingCheckouts } from "@/lib/db/schema";
import { PaidOrderError } from "@/lib/orders/create-paid-order";

export function createReservationEventRepository(database: Database): ReservationEventWriter {
  return {
    async markAwaitingPayment(session) {
      return database.transaction(async (tx) => {
        const reservationReference = await tx.query.inventoryReservations.findFirst({
          columns: { id: true, pendingCheckoutId: true },
          where: (reservations, { eq }) => eq(reservations.token, session.reservationToken),
        });

        if (!reservationReference) {
          throw new PaidOrderError("Inventory reservation was not found.");
        }

        // Match paid conversion's lock order so unpaid completion cannot deadlock with payment.
        const [pendingCheckout] = await tx
          .select()
          .from(pendingCheckouts)
          .where(eq(pendingCheckouts.id, reservationReference.pendingCheckoutId))
          .for("update");

        if (!pendingCheckout || pendingCheckout.token !== session.pendingCheckoutToken) {
          throw new PaidOrderError("Reservation does not match the pending checkout.");
        }

        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.id, reservationReference.id))
          .for("update");

        if (!reservation) {
          throw new PaidOrderError("Inventory reservation was not found.");
        }

        if (
          (reservation.stripeSessionId &&
            reservation.stripeSessionId !== session.stripeSessionId) ||
          (pendingCheckout.stripeSessionId &&
            pendingCheckout.stripeSessionId !== session.stripeSessionId)
        ) {
          throw new PaidOrderError("Reservation does not match the Stripe Session.");
        }

        if (reservation.status === "awaiting_payment") {
          return { changed: false };
        }

        if (reservation.status === "released" || reservation.status === "converted") {
          if (reservation.stripeSessionId !== session.stripeSessionId) {
            throw new PaidOrderError("Terminal reservation does not match the Stripe Session.");
          }

          return { changed: false };
        }

        await tx
          .update(pendingCheckouts)
          .set({ stripeSessionId: session.stripeSessionId })
          .where(eq(pendingCheckouts.id, pendingCheckout.id));
        const updated = await tx
          .update(inventoryReservations)
          .set({
            stripeSessionId: session.stripeSessionId,
            status: "awaiting_payment",
            reconcileLeaseUntil: null,
            lastReconcileErrorCode: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(inventoryReservations.id, reservation.id),
              eq(inventoryReservations.status, reservation.status),
            ),
          )
          .returning({ id: inventoryReservations.id });

        return { changed: updated.length === 1 };
      });
    },

    async releaseReservation(session, reason) {
      const changed = await releaseReservation(
        database,
        session.reservationToken,
        session.stripeSessionId,
        {
          reason,
          releasedAt: new Date(),
          allowedStatuses: ["provisioning", "active", "awaiting_payment"],
          pendingCheckoutToken: session.pendingCheckoutToken,
        },
      );

      return { changed };
    },
  };
}

let defaultRepository: ReservationEventWriter | undefined;

function getDefaultRepository(): ReservationEventWriter {
  defaultRepository ??= createReservationEventRepository(getDb());
  return defaultRepository;
}

export const reservationEventRepository: ReservationEventWriter = {
  markAwaitingPayment: (session) => getDefaultRepository().markAwaitingPayment(session),
  releaseReservation: (session, reason) =>
    getDefaultRepository().releaseReservation(session, reason),
};
