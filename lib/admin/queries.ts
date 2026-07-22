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
          priceCents: true,
          inventoryQty: true,
        },
        orderBy: (variants) => [asc(variants.sku)],
      },
    },
    orderBy: (products, { desc }) => [desc(products.updatedAt)],
  });
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
        orderBy: (variants) => [asc(variants.sku)],
      },
    },
  });
}

export async function getAdminOrders() {
  await requireAdmin();

  return getDb().query.orders.findMany({
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
    },
    orderBy: (orders, { desc }) => [desc(orders.createdAt)],
  });
}

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
