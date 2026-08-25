import "server-only";

import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { requireAdmin } from "@/lib/auth/require-admin";
import { shippingProfiles } from "@/lib/catalog/shipping-profiles";
import { getDb } from "@/lib/db/client";
import { orders, products, shippingRates } from "@/lib/db/schema";
import { adminEntityIdSchema } from "@/lib/validators/admin";

export async function getAdminDashboardSummary() {
  await requireAdmin();

  const db = getDb();
  const paymentEligible = and(
    ne(orders.refundStatus, "full"),
    inArray(orders.disputeStatus, ["none", "won"]),
  );
  const [
    productRows,
    orderRows,
    awaitingFulfillmentRows,
    inventoryExceptionRows,
    deliveriesToScheduleRows,
    awaitingDeliveryRows,
  ] = await Promise.all([
    db.select({ count: count() }).from(products),
    db.select({ count: count() }).from(orders),
    db
      .select({ count: count() })
      .from(orders)
      .where(
        and(
          eq(orders.status, "paid"),
          eq(orders.fulfillmentMethod, "shipping"),
          eq(orders.inventoryStatus, "allocated"),
          paymentEligible,
        ),
      ),
    db
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.status, "paid"), eq(orders.inventoryStatus, "exception"))),
    db
      .select({ count: count() })
      .from(orders)
      .where(
        and(
          eq(orders.status, "paid"),
          eq(orders.fulfillmentMethod, "delivery"),
          eq(orders.inventoryStatus, "allocated"),
          paymentEligible,
        ),
      ),
    db
      .select({ count: count() })
      .from(orders)
      .where(and(eq(orders.status, "delivery_scheduled"), paymentEligible)),
  ]);

  return {
    productCount: productRows[0]?.count ?? 0,
    orderCount: orderRows[0]?.count ?? 0,
    awaitingFulfillmentCount: awaitingFulfillmentRows[0]?.count ?? 0,
    inventoryExceptionCount: inventoryExceptionRows[0]?.count ?? 0,
    deliveriesToScheduleCount: deliveriesToScheduleRows[0]?.count ?? 0,
    awaitingDeliveryCount: awaitingDeliveryRows[0]?.count ?? 0,
  };
}

const recentOrderLimit = 5;

export async function getAdminRecentOrders() {
  await requireAdmin();

  return getDb().query.orders.findMany({
    columns: {
      id: true,
      orderNumber: true,
      email: true,
      status: true,
      inventoryStatus: true,
      fulfillmentMethod: true,
      refundStatus: true,
      disputeStatus: true,
      totalCents: true,
      currency: true,
      createdAt: true,
    },
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
    limit: recentOrderLimit,
  });
}

export async function getAdminAttentionItems() {
  await requireAdmin();

  const db = getDb();
  const [inventoryExceptionOrders, failedEmailDeliveries] = await Promise.all([
    db.query.orders.findMany({
      columns: {
        id: true,
        orderNumber: true,
        email: true,
        totalCents: true,
        currency: true,
        createdAt: true,
      },
      where: (orders, { and, eq }) =>
        and(eq(orders.status, "paid"), eq(orders.inventoryStatus, "exception")),
      orderBy: (orders, { asc }) => [asc(orders.createdAt)],
    }),
    db.query.orderEmailDeliveries.findMany({
      columns: {
        id: true,
        kind: true,
        attemptCount: true,
        lastErrorCode: true,
        lastAttemptAt: true,
      },
      // "failed" is terminal: the cron has exhausted retries and a human must intervene.
      where: (deliveries, { eq }) => eq(deliveries.status, "failed"),
      with: {
        order: {
          columns: {
            id: true,
            orderNumber: true,
          },
        },
      },
      orderBy: (deliveries, { asc }) => [asc(deliveries.lastAttemptAt)],
    }),
  ]);

  return { inventoryExceptionOrders, failedEmailDeliveries };
}

export async function getAdminProducts() {
  await requireAdmin();

  return getDb().query.products.findMany({
    columns: {
      id: true,
      slug: true,
      name: true,
      category: true,
      status: true,
      updatedAt: true,
    },
    with: {
      variants: {
        columns: {
          name: true,
          priceCents: true,
          inventoryQty: true,
          reservedQty: true,
        },
        orderBy: (variants) => [asc(variants.position), asc(variants.sku)],
      },
      // Only the first image is needed for the card grid thumbnail.
      images: {
        columns: {
          url: true,
          alt: true,
        },
        orderBy: (images) => [asc(images.position), asc(images.id)],
        limit: 1,
      },
    },
    orderBy: (products, { desc }) => [desc(products.updatedAt)],
  });
}

export type AdminProduct = Awaited<ReturnType<typeof getAdminProducts>>[number];

/** Returns every canonical profile, even if its seeded rate row needs to be repaired. */
export async function getAdminShippingRates() {
  await requireAdmin();

  const db = getDb();
  const [rateRows, productCountRows] = await Promise.all([
    db.select().from(shippingRates),
    db
      .select({ profile: products.shippingProfile, count: count() })
      .from(products)
      .groupBy(products.shippingProfile),
  ]);
  const ratesByProfile = new Map(rateRows.map((rate) => [rate.profile, rate.rateCents]));
  const productCountsByProfile = new Map(productCountRows.map((row) => [row.profile, row.count]));

  return shippingProfiles.map((profile) => ({
    ...profile,
    rateCents: ratesByProfile.get(profile.value) ?? null,
    productCount: productCountsByProfile.get(profile.value) ?? 0,
  }));
}

export async function getAdminProductById(input: unknown) {
  await requireAdmin();

  const parsedProductId = adminEntityIdSchema.safeParse(input);

  if (!parsedProductId.success) {
    return null;
  }

  return getDb().query.products.findFirst({
    where: (products, { eq }) => eq(products.id, parsedProductId.data),
    with: {
      images: {
        orderBy: (images) => [asc(images.position), asc(images.id)],
      },
      variants: {
        orderBy: (variants) => [asc(variants.position), asc(variants.sku)],
      },
    },
  });
}

export async function getAdminOrders() {
  await requireAdmin();

  const rows = await getDb().query.orders.findMany({
    columns: {
      id: true,
      orderNumber: true,
      email: true,
      status: true,
      inventoryStatus: true,
      fulfillmentMethod: true,
      refundStatus: true,
      refundedCents: true,
      disputeStatus: true,
      totalCents: true,
      currency: true,
      createdAt: true,
    },
    with: {
      items: {
        columns: {
          quantity: true,
        },
      },
      emailDeliveries: {
        columns: {
          kind: true,
          status: true,
        },
      },
    },
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
  });

  // Flattened so list filtering does not need to reach through the relation.
  return rows.map(({ emailDeliveries, ...order }) => ({
    ...order,
    itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
    confirmationDeliveryStatus:
      emailDeliveries.find((delivery) => delivery.kind === "confirmation")?.status ?? null,
  }));
}

export type AdminOrderSummary = Awaited<ReturnType<typeof getAdminOrders>>[number];

export async function getAdminOrderById(input: unknown) {
  await requireAdmin();

  const parsedOrderId = adminEntityIdSchema.safeParse(input);

  if (!parsedOrderId.success) {
    return null;
  }

  const order = await getDb().query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.id, parsedOrderId.data),
    with: {
      emailDeliveries: true,
      items: {
        orderBy: (items) => [asc(items.productNameSnapshot), asc(items.variantNameSnapshot)],
      },
    },
  });

  if (!order) {
    return null;
  }

  const { emailDeliveries, ...rest } = order;

  return {
    ...rest,
    confirmationDelivery: emailDeliveries.find((row) => row.kind === "confirmation") ?? null,
    deliveryScheduledDelivery:
      emailDeliveries.find((row) => row.kind === "delivery_scheduled") ?? null,
    shippedDelivery: emailDeliveries.find((row) => row.kind === "shipped") ?? null,
  };
}

/**
 * The local-delivery queue: paid delivery orders still to be scheduled, then scheduled orders
 * awaiting drop-off. Orders blocked by an inventory exception are returned separately in
 * `blocked`; they cannot be handed over until the exception is resolved.
 */
export async function getAdminDeliveryQueue() {
  await requireAdmin();

  const deliveryOrders = await getDb().query.orders.findMany({
    where: (orders, { and, eq, inArray, ne }) =>
      and(
        eq(orders.fulfillmentMethod, "delivery"),
        inArray(orders.status, ["paid", "delivery_scheduled"]),
        ne(orders.refundStatus, "full"),
        inArray(orders.disputeStatus, ["none", "won"]),
      ),
    columns: {
      id: true,
      orderNumber: true,
      email: true,
      status: true,
      inventoryStatus: true,
      refundStatus: true,
      disputeStatus: true,
      totalCents: true,
      currency: true,
      deliveryScheduledAt: true,
      createdAt: true,
    },
    with: {
      items: {
        columns: { quantity: true },
      },
    },
    orderBy: (orders, { asc: ascending }) => [ascending(orders.createdAt)],
  });

  return {
    toSchedule: deliveryOrders.filter(
      (order) => order.status === "paid" && order.inventoryStatus === "allocated",
    ),
    awaitingDelivery: deliveryOrders.filter((order) => order.status === "delivery_scheduled"),
    blocked: deliveryOrders.filter(
      (order) => order.status === "paid" && order.inventoryStatus === "exception",
    ),
  };
}
