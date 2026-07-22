import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const productStatusValues = ["draft", "active", "archived"] as const;
export const orderStatusValues = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;
export const orderInventoryStatusValues = ["allocated", "exception"] as const;
export const refundStatusValues = ["none", "partial", "full"] as const;
export const disputeStatusValues = ["none", "open", "won", "lost", "prevented"] as const;
export const stripePaymentEventKindValues = ["refund", "dispute"] as const;
export const confirmationDeliveryStatusValues = [
  "pending",
  "processing",
  "retry",
  "sent",
  "failed",
] as const;

export const productStatus = pgEnum("product_status", productStatusValues);
export const orderStatus = pgEnum("order_status", orderStatusValues);
export const orderInventoryStatus = pgEnum("order_inventory_status", orderInventoryStatusValues);
export const refundStatus = pgEnum("refund_status", refundStatusValues);
export const disputeStatus = pgEnum("dispute_status", disputeStatusValues);
export const stripePaymentEventKind = pgEnum(
  "stripe_payment_event_kind",
  stripePaymentEventKindValues,
);
export const confirmationDeliveryStatus = pgEnum(
  "confirmation_delivery_status",
  confirmationDeliveryStatusValues,
);

export type PendingCheckoutItem = {
  variantId: string;
  quantity: number;
};

export type PendingCheckoutLineSnapshot = {
  variantId: string;
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
  currency: string;
};

export type JsonRecord = Record<string, unknown>;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category"),
    status: productStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_status_idx").on(table.status),
    index("products_category_idx").on(table.category),
  ],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sku: text("sku").notNull(),
    priceCents: integer("price_cents").notNull(),
    inventoryQty: integer("inventory_qty").notNull().default(0),
  },
  (table) => [
    uniqueIndex("product_variants_sku_unique").on(table.sku),
    index("product_variants_product_id_idx").on(table.productId),
    check("product_variants_price_cents_nonnegative", sql`${table.priceCents} >= 0`),
    check("product_variants_inventory_qty_nonnegative", sql`${table.inventoryQty} >= 0`),
  ],
);

export const productImages = pgTable(
  "product_images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    alt: text("alt"),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("product_images_product_id_idx").on(table.productId),
    index("product_images_position_idx").on(table.position),
    check("product_images_position_nonnegative", sql`${table.position} >= 0`),
  ],
);

export const pendingCheckouts = pgTable(
  "pending_checkouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull(),
    items: jsonb("items").$type<PendingCheckoutItem[]>().notNull(),
    lineItems: jsonb("line_items").$type<PendingCheckoutLineSnapshot[]>(),
    stripeSessionId: text("stripe_session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("pending_checkouts_token_unique").on(table.token),
    uniqueIndex("pending_checkouts_stripe_session_id_unique").on(table.stripeSessionId),
    index("pending_checkouts_expires_at_idx").on(table.expiresAt),
    check(
      "pending_checkouts_line_items_nonempty_array",
      sql`${table.lineItems} is null or (jsonb_typeof(${table.lineItems}) = 'array' and jsonb_array_length(${table.lineItems}) > 0)`,
    ),
  ],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderNumber: text("order_number").notNull(),
    email: text("email").notNull(),
    status: orderStatus("status").notNull().default("pending"),
    inventoryStatus: orderInventoryStatus("inventory_status").notNull().default("allocated"),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    refundStatus: refundStatus("refund_status").notNull().default("none"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    disputeStatus: disputeStatus("dispute_status").notNull().default("none"),
    subtotalCents: integer("subtotal_cents").notNull(),
    taxCents: integer("tax_cents").notNull().default(0),
    shippingCents: integer("shipping_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    currency: text("currency").notNull().default("cad"),
    shippingAddress: jsonb("shipping_address").$type<JsonRecord | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("orders_order_number_unique").on(table.orderNumber),
    uniqueIndex("orders_stripe_session_id_unique").on(table.stripeSessionId),
    uniqueIndex("orders_stripe_payment_intent_id_unique").on(table.stripePaymentIntentId),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.createdAt),
    check("orders_subtotal_cents_nonnegative", sql`${table.subtotalCents} >= 0`),
    check("orders_tax_cents_nonnegative", sql`${table.taxCents} >= 0`),
    check("orders_shipping_cents_nonnegative", sql`${table.shippingCents} >= 0`),
    check("orders_total_cents_nonnegative", sql`${table.totalCents} >= 0`),
    check("orders_refunded_cents_nonnegative", sql`${table.refundedCents} >= 0`),
    check(
      "orders_refunded_cents_not_above_total",
      sql`${table.refundedCents} <= ${table.totalCents}`,
    ),
    check(
      "orders_fulfilled_inventory_allocated",
      sql`${table.status} <> 'fulfilled' OR ${table.inventoryStatus} = 'allocated'`,
    ),
  ],
);

export const stripePaymentEvents = pgTable(
  "stripe_payment_events",
  {
    stripeEventId: text("stripe_event_id").primaryKey(),
    stripePaymentIntentId: text("stripe_payment_intent_id").notNull(),
    kind: stripePaymentEventKind("kind").notNull(),
    refundedCents: integer("refunded_cents"),
    currency: text("currency"),
    disputeStatus: disputeStatus("dispute_status"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("stripe_payment_events_payment_intent_idx").on(table.stripePaymentIntentId),
    index("stripe_payment_events_occurred_at_idx").on(table.occurredAt),
    check(
      "stripe_payment_events_refunded_cents_nonnegative",
      sql`${table.refundedCents} IS NULL OR ${table.refundedCents} >= 0`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
    productNameSnapshot: text("product_name_snapshot").notNull(),
    variantNameSnapshot: text("variant_name_snapshot").notNull(),
    unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    index("order_items_order_id_idx").on(table.orderId),
    index("order_items_variant_id_idx").on(table.variantId),
    check(
      "order_items_unit_price_cents_snapshot_nonnegative",
      sql`${table.unitPriceCentsSnapshot} >= 0`,
    ),
    check("order_items_quantity_positive", sql`${table.quantity} > 0`),
  ],
);

export const orderConfirmationDeliveries = pgTable(
  "order_confirmation_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    status: confirmationDeliveryStatus("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    providerMessageId: text("provider_message_id"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("order_confirmation_deliveries_order_id_unique").on(table.orderId),
    uniqueIndex("order_confirmation_deliveries_idempotency_key_unique").on(table.idempotencyKey),
    index("order_confirmation_deliveries_due_idx").on(table.status, table.nextAttemptAt),
    check(
      "order_confirmation_deliveries_attempt_count_nonnegative",
      sql`${table.attemptCount} >= 0`,
    ),
    check(
      "order_confirmation_deliveries_sent_at_required",
      sql`${table.status} <> 'sent' OR ${table.deliveredAt} IS NOT NULL`,
    ),
  ],
);

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
  images: many(productImages),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, {
    fields: [productVariants.productId],
    references: [products.id],
  }),
  orderItems: many(orderItems),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many, one }) => ({
  items: many(orderItems),
  confirmationDelivery: one(orderConfirmationDeliveries),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, {
    fields: [orderItems.orderId],
    references: [orders.id],
  }),
  variant: one(productVariants, {
    fields: [orderItems.variantId],
    references: [productVariants.id],
  }),
}));

export const orderConfirmationDeliveriesRelations = relations(
  orderConfirmationDeliveries,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderConfirmationDeliveries.orderId],
      references: [orders.id],
    }),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
export type PendingCheckout = typeof pendingCheckouts.$inferSelect;
export type NewPendingCheckout = typeof pendingCheckouts.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type StripePaymentEvent = typeof stripePaymentEvents.$inferSelect;
export type NewStripePaymentEvent = typeof stripePaymentEvents.$inferInsert;
export type OrderConfirmationDelivery = typeof orderConfirmationDeliveries.$inferSelect;
export type NewOrderConfirmationDelivery = typeof orderConfirmationDeliveries.$inferInsert;
