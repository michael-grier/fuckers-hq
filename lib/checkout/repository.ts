import "server-only";

import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";

import {
  type CheckoutRepository,
  type CheckoutReservation,
  parsePersistedStripeSessionParams,
} from "@/lib/checkout/create-hosted-checkout";
import { CheckoutError } from "@/lib/checkout/errors";
import {
  combineCartLines,
  createPendingCheckoutLineSnapshots,
  resolveCheckoutLines,
} from "@/lib/checkout/items";
import type { Database } from "@/lib/db/client";
import { getDb } from "@/lib/db/client";
import {
  inventoryReservationItems,
  inventoryReservations,
  pendingCheckouts,
  products,
  productVariants,
} from "@/lib/db/schema";
import { parsePendingCheckoutLineSnapshots } from "@/lib/orders/create-paid-order";
import { type CartLine, cartSchema } from "@/lib/validators/cart";

const stripeCreateIdempotencyPrefix = "checkout-session/";

export function createCheckoutRepository(database: Database): CheckoutRepository {
  return {
    async reserveCheckout(checkout) {
      return database.transaction(async (tx) => {
        // The request lock makes retries converge before either can reserve stock.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${checkout.requestId}))`);

        const existing = await tx.query.inventoryReservations.findFirst({
          where: (reservations, { eq }) => eq(reservations.requestId, checkout.requestId),
          with: {
            pendingCheckout: true,
          },
        });

        if (existing) {
          if (
            existing.status === "released" ||
            existing.status === "converted" ||
            existing.status === "awaiting_payment"
          ) {
            throw new CheckoutError("This checkout request is no longer payable.", 409);
          }

          assertSameCart(existing.pendingCheckout.items, checkout.items);
          const reservation = toCheckoutReservation(
            existing,
            parsePendingCheckoutLineSnapshots(existing.pendingCheckout.lineItems),
            existing.pendingCheckout.token,
          );

          if (existing.stripeSessionParams) {
            parsePersistedStripeSessionParams(existing.stripeSessionParams, reservation);
          }

          return reservation;
        }

        const combinedItems = combineCartLines(checkout.items).sort((left, right) =>
          left.variantId.localeCompare(right.variantId),
        );
        const variantIds = combinedItems.map((item) => item.variantId);
        const variants = await tx
          .select({
            id: productVariants.id,
            productName: products.name,
            productStatus: products.status,
            variantName: productVariants.name,
            priceCents: productVariants.priceCents,
            inventoryQty: productVariants.inventoryQty,
            reservedQty: productVariants.reservedQty,
          })
          .from(productVariants)
          .innerJoin(products, eq(products.id, productVariants.productId))
          .where(inArray(productVariants.id, variantIds))
          .orderBy(asc(productVariants.id))
          .for("update");
        const resolvedLines = resolveCheckoutLines(combinedItems, variants);
        const lineItems = createPendingCheckoutLineSnapshots(resolvedLines);
        const [pendingCheckout] = await tx
          .insert(pendingCheckouts)
          .values({
            token: checkout.pendingCheckoutToken,
            items: combinedItems,
            lineItems,
            expiresAt: checkout.expiresAt,
          })
          .returning({ id: pendingCheckouts.id });

        if (!pendingCheckout) {
          throw new CheckoutError("Unable to persist the pending checkout.", 500);
        }

        const stripeCreateIdempotencyKey = `${stripeCreateIdempotencyPrefix}${checkout.reservationToken}`;
        const [reservation] = await tx
          .insert(inventoryReservations)
          .values({
            token: checkout.reservationToken,
            requestId: checkout.requestId,
            pendingCheckoutId: pendingCheckout.id,
            stripeCreateIdempotencyKey,
            expiresAt: checkout.expiresAt,
            nextReconcileAt: checkout.nextReconcileAt,
          })
          .returning({ id: inventoryReservations.id });

        if (!reservation) {
          throw new CheckoutError("Unable to persist the inventory reservation.", 500);
        }

        await tx.insert(inventoryReservationItems).values(
          resolvedLines.map((line) => ({
            reservationId: reservation.id,
            variantId: line.id,
            variantIdSnapshot: line.id,
            quantity: line.quantity,
          })),
        );

        for (const line of resolvedLines) {
          const updated = await tx
            .update(productVariants)
            .set({
              reservedQty: sql`${productVariants.reservedQty} + ${line.quantity}`,
            })
            .where(
              and(
                eq(productVariants.id, line.id),
                gte(
                  sql`${productVariants.inventoryQty} - ${productVariants.reservedQty}`,
                  line.quantity,
                ),
              ),
            )
            .returning({ id: productVariants.id });

          if (updated.length !== 1) {
            throw new CheckoutError("Inventory changed while checkout was being reserved.", 409);
          }
        }

        return {
          pendingCheckoutToken: checkout.pendingCheckoutToken,
          reservationToken: checkout.reservationToken,
          stripeCreateIdempotencyKey,
          stripeSessionId: null,
          stripeSessionParams: null,
          expiresAt: checkout.expiresAt,
          lineItems,
        };
      });
    },

    async prepareStripeSession(reservationToken, params) {
      return database.transaction(async (tx) => {
        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.token, reservationToken))
          .for("update");

        if (
          !reservation ||
          (reservation.status !== "provisioning" && reservation.status !== "active")
        ) {
          throw new CheckoutError("Inventory reservation cannot create a Stripe Session.", 409);
        }

        const pendingCheckout = await tx.query.pendingCheckouts.findFirst({
          columns: { token: true },
          where: (checkouts, { eq }) => eq(checkouts.id, reservation.pendingCheckoutId),
        });

        if (!pendingCheckout) {
          throw new CheckoutError("Pending checkout was not found.", 500);
        }

        const parsedReservation: CheckoutReservation = {
          pendingCheckoutToken: pendingCheckout.token,
          reservationToken: reservation.token,
          stripeCreateIdempotencyKey: reservation.stripeCreateIdempotencyKey,
          stripeSessionId: reservation.stripeSessionId,
          stripeSessionParams: reservation.stripeSessionParams,
          expiresAt: reservation.expiresAt,
          lineItems: [],
        };

        if (reservation.stripeSessionParams) {
          return parsePersistedStripeSessionParams(
            reservation.stripeSessionParams,
            parsedReservation,
          );
        }

        if (reservation.status === "active") {
          throw new CheckoutError("Active reservation is missing its Stripe Session request.", 500);
        }

        const persistedParams = params as unknown as Record<string, unknown>;
        parsePersistedStripeSessionParams(persistedParams, parsedReservation);
        await tx
          .update(inventoryReservations)
          .set({
            stripeSessionParams: persistedParams,
            updatedAt: new Date(),
          })
          .where(eq(inventoryReservations.id, reservation.id));

        return params;
      });
    },

    async linkStripeSession(reservationToken, stripeSessionId) {
      await database.transaction(async (tx) => {
        const reservationReference = await tx.query.inventoryReservations.findFirst({
          columns: { id: true, pendingCheckoutId: true },
          where: (reservations, { eq }) => eq(reservations.token, reservationToken),
        });

        if (!reservationReference) {
          throw new CheckoutError("Inventory reservation cannot be linked.", 409);
        }

        // Paid conversion uses the same pending-checkout → reservation order to avoid deadlocks.
        const [pendingCheckout] = await tx
          .select()
          .from(pendingCheckouts)
          .where(eq(pendingCheckouts.id, reservationReference.pendingCheckoutId))
          .for("update");

        if (!pendingCheckout) {
          throw new CheckoutError("Pending checkout was not found.", 500);
        }

        if (
          pendingCheckout.stripeSessionId &&
          pendingCheckout.stripeSessionId !== stripeSessionId
        ) {
          throw new CheckoutError("Pending checkout is linked to another Stripe Session.", 500);
        }

        const [reservation] = await tx
          .select()
          .from(inventoryReservations)
          .where(eq(inventoryReservations.id, reservationReference.id))
          .for("update");

        if (
          !reservation ||
          reservation.status === "released" ||
          reservation.status === "converted"
        ) {
          throw new CheckoutError("Inventory reservation cannot be linked.", 409);
        }

        if (reservation.stripeSessionId && reservation.stripeSessionId !== stripeSessionId) {
          throw new CheckoutError(
            "Inventory reservation is linked to another Stripe Session.",
            500,
          );
        }

        await tx
          .update(pendingCheckouts)
          .set({ stripeSessionId })
          .where(eq(pendingCheckouts.id, pendingCheckout.id));
        await tx
          .update(inventoryReservations)
          .set({
            stripeSessionId,
            status: reservation.status === "provisioning" ? "active" : reservation.status,
            nextReconcileAt: reservation.expiresAt,
            reconcileLeaseUntil: null,
            lastReconcileErrorCode: null,
            updatedAt: new Date(),
          })
          .where(eq(inventoryReservations.id, reservation.id));
      });
    },

    async releaseSessionCreationFailure(reservationToken, releasedAt) {
      return releaseReservation(database, reservationToken, null, {
        reason: "stripe_session_creation_failed",
        releasedAt,
        allowedStatuses: ["provisioning"],
      });
    },
  };
}

let defaultRepository: CheckoutRepository | undefined;

function getDefaultRepository(): CheckoutRepository {
  defaultRepository ??= createCheckoutRepository(getDb());
  return defaultRepository;
}

export const checkoutRepository: CheckoutRepository = {
  reserveCheckout: (checkout) => getDefaultRepository().reserveCheckout(checkout),
  prepareStripeSession: (reservationToken, params) =>
    getDefaultRepository().prepareStripeSession(reservationToken, params),
  linkStripeSession: (reservationToken, stripeSessionId) =>
    getDefaultRepository().linkStripeSession(reservationToken, stripeSessionId),
  releaseSessionCreationFailure: (reservationToken, releasedAt) =>
    getDefaultRepository().releaseSessionCreationFailure(reservationToken, releasedAt),
};

export async function releaseReservation(
  database: Database,
  reservationToken: string,
  stripeSessionId: string | null,
  options: {
    reason: string;
    releasedAt: Date;
    allowedStatuses: Array<"provisioning" | "active" | "awaiting_payment">;
    pendingCheckoutToken?: string;
  },
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const reservationReference = await tx.query.inventoryReservations.findFirst({
      columns: { id: true, pendingCheckoutId: true },
      where: (reservations, { eq }) => eq(reservations.token, reservationToken),
    });

    if (!reservationReference) {
      throw new CheckoutError("Inventory reservation was not found.", 500);
    }

    // Keep the shared lock order stable when payment and release arrive concurrently.
    const [pendingCheckout] = await tx
      .select()
      .from(pendingCheckouts)
      .where(eq(pendingCheckouts.id, reservationReference.pendingCheckoutId))
      .for("update");

    if (!pendingCheckout) {
      throw new CheckoutError("Pending checkout was not found.", 500);
    }

    const [reservation] = await tx
      .select()
      .from(inventoryReservations)
      .where(eq(inventoryReservations.id, reservationReference.id))
      .for("update");

    if (!reservation) {
      throw new CheckoutError("Inventory reservation was not found.", 500);
    }

    if (reservation.status === "released" || reservation.status === "converted") {
      return false;
    }

    if (!options.allowedStatuses.includes(reservation.status)) {
      throw new CheckoutError("Inventory reservation cannot be released by this event.", 500);
    }

    if (stripeSessionId !== null) {
      if (
        (options.pendingCheckoutToken && pendingCheckout.token !== options.pendingCheckoutToken) ||
        (reservation.stripeSessionId && reservation.stripeSessionId !== stripeSessionId) ||
        (pendingCheckout.stripeSessionId && pendingCheckout.stripeSessionId !== stripeSessionId)
      ) {
        throw new CheckoutError("Inventory reservation does not match the Stripe Session.", 500);
      }

      await tx
        .update(pendingCheckouts)
        .set({ stripeSessionId })
        .where(eq(pendingCheckouts.id, pendingCheckout.id));
    }

    const items = await tx
      .select({
        variantId: inventoryReservationItems.variantId,
        quantity: inventoryReservationItems.quantity,
      })
      .from(inventoryReservationItems)
      .where(eq(inventoryReservationItems.reservationId, reservation.id))
      .orderBy(asc(inventoryReservationItems.variantIdSnapshot));
    const variantIds = items
      .map((item) => item.variantId)
      .filter((variantId): variantId is string => variantId !== null);

    if (variantIds.length !== items.length) {
      throw new CheckoutError("Active reservation references a deleted variant.", 500);
    }

    await tx
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(inArray(productVariants.id, variantIds))
      .orderBy(asc(productVariants.id))
      .for("update");

    for (const item of items) {
      const updated = await tx
        .update(productVariants)
        .set({
          reservedQty: sql`${productVariants.reservedQty} - ${item.quantity}`,
        })
        .where(
          and(
            eq(productVariants.id, item.variantId as string),
            gte(productVariants.reservedQty, item.quantity),
          ),
        )
        .returning({ id: productVariants.id });

      if (updated.length !== 1) {
        throw new CheckoutError("Reserved inventory is inconsistent.", 500);
      }
    }

    await tx
      .update(inventoryReservationItems)
      .set({ variantId: null })
      .where(eq(inventoryReservationItems.reservationId, reservation.id));
    await tx
      .update(inventoryReservations)
      .set({
        status: "released",
        stripeSessionId: reservation.stripeSessionId ?? stripeSessionId,
        releasedAt: options.releasedAt,
        releaseReason: options.reason,
        reconcileLeaseUntil: null,
        lastReconcileErrorCode: null,
        updatedAt: options.releasedAt,
      })
      .where(eq(inventoryReservations.id, reservation.id));

    return true;
  });
}

function assertSameCart(persistedInput: unknown, requestedItems: CartLine[]): void {
  const persisted = cartSchema.safeParse(persistedInput);

  if (!persisted.success) {
    throw new CheckoutError("Persisted checkout cart is invalid.", 500);
  }

  const persistedLines = combineCartLines(persisted.data).sort((left, right) =>
    left.variantId.localeCompare(right.variantId),
  );
  const requestedLines = combineCartLines(requestedItems).sort((left, right) =>
    left.variantId.localeCompare(right.variantId),
  );

  if (JSON.stringify(persistedLines) !== JSON.stringify(requestedLines)) {
    throw new CheckoutError("Checkout request ID was already used for another cart.", 409);
  }
}

function toCheckoutReservation(
  reservation: typeof inventoryReservations.$inferSelect,
  lineItems: ReturnType<typeof parsePendingCheckoutLineSnapshots>,
  pendingCheckoutToken: string,
): CheckoutReservation {
  return {
    pendingCheckoutToken,
    reservationToken: reservation.token,
    stripeCreateIdempotencyKey: reservation.stripeCreateIdempotencyKey,
    stripeSessionId: reservation.stripeSessionId,
    stripeSessionParams: reservation.stripeSessionParams,
    expiresAt: reservation.expiresAt,
    lineItems,
  };
}
