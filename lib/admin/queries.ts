import "server-only";

import { and, asc, count, eq, inArray, ne } from "drizzle-orm";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getDb } from "@/lib/db/client";
import { orders, products } from "@/lib/db/schema";
import { adminEntityIdSchema } from "@/lib/validators/admin";

export async function getAdminDashboardSummary() {
  await requireAdmin();

  const db = getDb();
  const [productRows, orderRows, awaitingFulfillmentRows, inventoryExceptionRows] =
    await Promise.all([
      db.select({ count: count() }).from(products),
      db.select({ count: count() }).from(orders),
      db
        .select({ count: count() })
        .from(orders)
        .where(
          and(
            eq(orders.status, "paid"),
            eq(orders.inventoryStatus, "allocated"),
            ne(orders.refundStatus, "full"),
            inArray(orders.disputeStatus, ["none", "won"]),
          ),
        ),
      db
        .select({ count: count() })
        .from(orders)
        .where(and(eq(orders.status, "paid"), eq(orders.inventoryStatus, "exception"))),
    ]);

  return {
    productCount: productRows[0]?.count ?? 0,
    orderCount: orderRows[0]?.count ?? 0,
    awaitingFulfillmentCount: awaitingFulfillmentRows[0]?.count ?? 0,
    inventoryExceptionCount: inventoryExceptionRows[0]?.count ?? 0,
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
  const [inventoryExceptionOrders, failedConfirmationDeliveries] = await Promise.all([
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
    db.query.orderConfirmationDeliveries.findMany({
      columns: {
        id: true,
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

  return { inventoryExceptionOrders, failedConfirmationDeliveries };
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
      confirmationDelivery: {
        columns: {
          status: true,
        },
      },
    },
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
  });

  // Flattened so list filtering does not need to reach through the relation.
  return rows.map(({ confirmationDelivery, ...order }) => ({
    ...order,
    itemCount: order.items.reduce((total, item) => total + item.quantity, 0),
    confirmationDeliveryStatus: confirmationDelivery?.status ?? null,
  }));
}

export type AdminOrderSummary = Awaited<ReturnType<typeof getAdminOrders>>[number];

export async function getAdminOrderById(input: unknown) {
  await requireAdmin();

  const parsedOrderId = adminEntityIdSchema.safeParse(input);

  if (!parsedOrderId.success) {
    return null;
  }

  return getDb().query.orders.findFirst({
    where: (orders, { eq }) => eq(orders.id, parsedOrderId.data),
    with: {
      confirmationDelivery: true,
      items: {
        orderBy: (items) => [asc(items.productNameSnapshot), asc(items.variantNameSnapshot)],
      },
    },
  });
}
