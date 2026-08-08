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

import { productCategoryValues, productSubcategories } from "@/lib/catalog/categories";
import { shippingCarrierValues } from "@/lib/orders/shipping-carriers";

export const productStatusValues = ["draft", "active", "archived"] as const;
// `fulfilled` is the terminal state for both methods: shipped for shipping, collected for pickup.
export const orderStatusValues = [
  "pending",
  "paid",
  "ready_for_pickup",
  "fulfilled",
  "cancelled",
  "refunded",
] as const;
export const orderInventoryStatusValues = ["allocated", "exception"] as const;
export const fulfillmentMethodValues = ["shipping", "pickup"] as const;
export const orderEmailKindValues = ["confirmation", "pickup_ready", "shipped"] as const;
export const refundStatusValues = ["none", "partial", "full"] as const;
export const disputeStatusValues = ["none", "open", "won", "lost", "prevented"] as const;
export const stripePaymentEventKindValues = ["refund", "dispute"] as const;
export const orderEmailDeliveryStatusValues = [
  "pending",
  "processing",
  "retry",
  "sent",
  "failed",
] as const;
export const inventoryReservationStatusValues = [
  "provisioning",
  "active",
  "awaiting_payment",
  "converted",
  "released",
] as const;

export const productStatus = pgEnum("product_status", productStatusValues);
export const orderStatus = pgEnum("order_status", orderStatusValues);
export const orderInventoryStatus = pgEnum("order_inventory_status", orderInventoryStatusValues);
export const fulfillmentMethod = pgEnum("fulfillment_method", fulfillmentMethodValues);
export const shippingCarrier = pgEnum("shipping_carrier", shippingCarrierValues);
export const orderEmailKind = pgEnum("order_email_kind", orderEmailKindValues);
export const refundStatus = pgEnum("refund_status", refundStatusValues);
export const disputeStatus = pgEnum("dispute_status", disputeStatusValues);
export const stripePaymentEventKind = pgEnum(
  "stripe_payment_event_kind",
  stripePaymentEventKindValues,
);
export const orderEmailDeliveryStatus = pgEnum(
  "order_email_delivery_status",
  orderEmailDeliveryStatusValues,
);
export const inventoryReservationStatus = pgEnum(
  "inventory_reservation_status",
  inventoryReservationStatusValues,
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

// Built from the canonical taxonomy so the database check constraint can never drift from the
// application contract in lib/catalog/categories.ts.
const productTaxonomyPairsSql = sql.raw(
  productCategoryValues
    .map((category) => {
      const subcategories = productSubcategories
        .filter((subcategory) => subcategory.category === category)
        .map(({ value }) => `'${value}'`)
        .join(", ");

      return `("category" = '${category}' AND "subcategory" IN (${subcategories}))`;
    })
    .join(" OR "),
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    category: text("category").notNull(),
    subcategory: text("subcategory").notNull(),
    status: productStatus("status").notNull().default("draft"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_slug_unique").on(table.slug),
    index("products_status_idx").on(table.status),
    index("products_category_subcategory_idx").on(table.category, table.subcategory),
    check("products_category_subcategory_pair", sql`${productTaxonomyPairsSql}`),
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
    reservedQty: integer("reserved_qty").notNull().default(0),
    // Admin-controlled display order within a product; lower positions render first.
    position: integer("position").notNull().default(0),
  },
  (table) => [
    uniqueIndex("product_variants_sku_unique").on(table.sku),
    index("product_variants_product_id_idx").on(table.productId),
    index("product_variants_product_id_position_idx").on(table.productId, table.position),
    check("product_variants_position_nonnegative", sql`${table.position} >= 0`),
    check("product_variants_price_cents_nonnegative", sql`${table.priceCents} >= 0`),
    check("product_variants_inventory_qty_nonnegative", sql`${table.inventoryQty} >= 0`),
    check("product_variants_reserved_qty_nonnegative", sql`${table.reservedQty} >= 0`),
    check(
      "product_variants_reserved_qty_not_above_inventory",
      sql`${table.reservedQty} <= ${table.inventoryQty}`,
    ),
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
    // The server-persisted fulfillment choice. Paid-order conversion reads it from here rather
    // than from Stripe Session metadata so the browser cannot restate it after checkout starts.
    fulfillmentMethod: fulfillmentMethod("fulfillment_method").notNull().default("shipping"),
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

export const inventoryReservations = pgTable(
  "inventory_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull(),
    requestId: uuid("request_id").notNull(),
    pendingCheckoutId: uuid("pending_checkout_id")
      .notNull()
      .references(() => pendingCheckouts.id, { onDelete: "restrict" }),
    stripeSessionId: text("stripe_session_id"),
    stripeCreateIdempotencyKey: text("stripe_create_idempotency_key").notNull(),
    stripeSessionParams: jsonb("stripe_session_params").$type<JsonRecord>(),
    status: inventoryReservationStatus("status").notNull().default("provisioning"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    releaseReason: text("release_reason"),
    nextReconcileAt: timestamp("next_reconcile_at", { withTimezone: true }).notNull(),
    reconcileLeaseUntil: timestamp("reconcile_lease_until", { withTimezone: true }),
    reconcileAttemptCount: integer("reconcile_attempt_count").notNull().default(0),
    lastReconcileErrorCode: text("last_reconcile_error_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inventory_reservations_token_unique").on(table.token),
    uniqueIndex("inventory_reservations_request_id_unique").on(table.requestId),
    uniqueIndex("inventory_reservations_pending_checkout_id_unique").on(table.pendingCheckoutId),
    uniqueIndex("inventory_reservations_stripe_session_id_unique").on(table.stripeSessionId),
    uniqueIndex("inventory_reservations_stripe_idempotency_key_unique").on(
      table.stripeCreateIdempotencyKey,
    ),
    index("inventory_reservations_reconcile_due_idx").on(table.status, table.nextReconcileAt),
    check(
      "inventory_reservations_attempt_count_nonnegative",
      sql`${table.reconcileAttemptCount} >= 0`,
    ),
    check(
      "inventory_reservations_terminal_state_consistent",
      sql`(
        ${table.status} = 'converted'
        AND ${table.convertedAt} IS NOT NULL
        AND ${table.releasedAt} IS NULL
        AND ${table.releaseReason} IS NULL
      ) OR (
        ${table.status} = 'released'
        AND ${table.convertedAt} IS NULL
        AND ${table.releasedAt} IS NOT NULL
        AND ${table.releaseReason} IS NOT NULL
      ) OR (
        ${table.status} IN ('provisioning', 'active', 'awaiting_payment')
        AND ${table.convertedAt} IS NULL
        AND ${table.releasedAt} IS NULL
        AND ${table.releaseReason} IS NULL
      )`,
    ),
    check(
      "inventory_reservations_linked_state_has_session",
      sql`${table.status} NOT IN ('active', 'awaiting_payment', 'converted') OR ${table.stripeSessionId} IS NOT NULL`,
    ),
  ],
);

export const inventoryReservationItems = pgTable(
  "inventory_reservation_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => inventoryReservations.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id").references(() => productVariants.id, {
      onDelete: "restrict",
    }),
    variantIdSnapshot: uuid("variant_id_snapshot").notNull(),
    quantity: integer("quantity").notNull(),
  },
  (table) => [
    uniqueIndex("inventory_reservation_items_reservation_variant_unique").on(
      table.reservationId,
      table.variantIdSnapshot,
    ),
    index("inventory_reservation_items_variant_id_idx").on(table.variantId),
    check("inventory_reservation_items_quantity_positive", sql`${table.quantity} > 0`),
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
    fulfillmentMethod: fulfillmentMethod("fulfillment_method").notNull().default("shipping"),
    readyForPickupAt: timestamp("ready_for_pickup_at", { withTimezone: true }),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    // Tracking is optional: not every shipment has a number, and the shipping notification is sent
    // either way. Both columns are written together or not at all.
    trackingCarrier: shippingCarrier("tracking_carrier"),
    trackingNumber: text("tracking_number"),
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
    index("orders_fulfillment_method_status_idx").on(table.fulfillmentMethod, table.status),
    check("orders_subtotal_cents_nonnegative", sql`${table.subtotalCents} >= 0`),
    check("orders_tax_cents_nonnegative", sql`${table.taxCents} >= 0`),
    check("orders_shipping_cents_nonnegative", sql`${table.shippingCents} >= 0`),
    check("orders_total_cents_nonnegative", sql`${table.totalCents} >= 0`),
    check("orders_refunded_cents_nonnegative", sql`${table.refundedCents} >= 0`),
    check(
      "orders_refunded_cents_not_above_total",
      sql`${table.refundedCents} <= ${table.totalCents}`,
    ),
    // These compare status::text rather than the enum literal. Postgres forbids using a newly
    // added enum value in the transaction that adds it, and the migrator runs every pending
    // migration in one transaction, so an enum-literal comparison here would break a fresh deploy.
    check(
      "orders_fulfilled_inventory_allocated",
      sql`${table.status}::text NOT IN ('fulfilled', 'ready_for_pickup') OR ${table.inventoryStatus} = 'allocated'`,
    ),
    check(
      "orders_ready_for_pickup_requires_pickup",
      sql`${table.status}::text <> 'ready_for_pickup' OR ${table.fulfillmentMethod} = 'pickup'`,
    ),
    // The timestamp survives collection so the admin history keeps how long the order waited.
    // Covers `fulfilled` as well, so a pickup order cannot reach its terminal state without the
    // staging step that told the customer to collect it. The application already enforces the
    // paid -> ready_for_pickup -> fulfilled path; this keeps a direct write from bypassing it.
    check(
      "orders_ready_for_pickup_at_required",
      sql`${table.status}::text NOT IN ('ready_for_pickup', 'fulfilled')
        OR ${table.fulfillmentMethod} <> 'pickup'
        OR ${table.readyForPickupAt} IS NOT NULL`,
    ),
    // A number without a carrier cannot produce a tracking link, and a carrier without a number
    // tells the customer nothing, so a half-recorded shipment is rejected outright.
    check(
      "orders_tracking_pair_complete",
      sql`(${table.trackingCarrier} IS NULL AND ${table.trackingNumber} IS NULL)
        OR (${table.trackingCarrier} IS NOT NULL AND ${table.trackingNumber} IS NOT NULL)`,
    ),
    // Shipment facts only exist for shipping orders; a pickup order is handed over in person.
    // There is deliberately no "fulfilled shipping order must have shipped_at" check: orders
    // fulfilled before this column existed have no shipment time, and inventing one would put
    // fabricated history into the record.
    check(
      "orders_shipment_requires_shipping_method",
      sql`(${table.shippedAt} IS NULL AND ${table.trackingNumber} IS NULL)
        OR ${table.fulfillmentMethod} = 'shipping'`,
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

// Despite the name, this outbox now carries every transactional order email. `kind` selects the
// template and the recipient-facing meaning; the retry, lease, and backoff machinery is shared.
export const orderEmailDeliveries = pgTable(
  "order_email_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    kind: orderEmailKind("kind").notNull().default("confirmation"),
    status: orderEmailDeliveryStatus("status").notNull().default("pending"),
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
    uniqueIndex("order_email_deliveries_order_id_kind_unique").on(table.orderId, table.kind),
    uniqueIndex("order_email_deliveries_idempotency_key_unique").on(table.idempotencyKey),
    index("order_email_deliveries_due_idx").on(table.status, table.nextAttemptAt),
    check("order_email_deliveries_attempt_count_nonnegative", sql`${table.attemptCount} >= 0`),
    check(
      "order_email_deliveries_sent_at_required",
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
  reservationItems: many(inventoryReservationItems),
}));

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
}));

export const ordersRelations = relations(orders, ({ many }) => ({
  items: many(orderItems),
  emailDeliveries: many(orderEmailDeliveries),
}));

export const pendingCheckoutsRelations = relations(pendingCheckouts, ({ one }) => ({
  reservation: one(inventoryReservations),
}));

export const inventoryReservationsRelations = relations(inventoryReservations, ({ many, one }) => ({
  pendingCheckout: one(pendingCheckouts, {
    fields: [inventoryReservations.pendingCheckoutId],
    references: [pendingCheckouts.id],
  }),
  items: many(inventoryReservationItems),
}));

export const inventoryReservationItemsRelations = relations(
  inventoryReservationItems,
  ({ one }) => ({
    reservation: one(inventoryReservations, {
      fields: [inventoryReservationItems.reservationId],
      references: [inventoryReservations.id],
    }),
    variant: one(productVariants, {
      fields: [inventoryReservationItems.variantId],
      references: [productVariants.id],
    }),
  }),
);

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

export const orderEmailDeliveriesRelations = relations(orderEmailDeliveries, ({ one }) => ({
  order: one(orders, {
    fields: [orderEmailDeliveries.orderId],
    references: [orders.id],
  }),
}));

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type ProductVariant = typeof productVariants.$inferSelect;
export type NewProductVariant = typeof productVariants.$inferInsert;
export type ProductImage = typeof productImages.$inferSelect;
export type NewProductImage = typeof productImages.$inferInsert;
export type PendingCheckout = typeof pendingCheckouts.$inferSelect;
export type NewPendingCheckout = typeof pendingCheckouts.$inferInsert;
export type InventoryReservation = typeof inventoryReservations.$inferSelect;
export type NewInventoryReservation = typeof inventoryReservations.$inferInsert;
export type InventoryReservationItem = typeof inventoryReservationItems.$inferSelect;
export type NewInventoryReservationItem = typeof inventoryReservationItems.$inferInsert;
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type StripePaymentEvent = typeof stripePaymentEvents.$inferSelect;
export type NewStripePaymentEvent = typeof stripePaymentEvents.$inferInsert;
export type OrderEmailDelivery = typeof orderEmailDeliveries.$inferSelect;
export type NewOrderEmailDelivery = typeof orderEmailDeliveries.$inferInsert;
export type FulfillmentMethod = (typeof fulfillmentMethodValues)[number];
export type OrderEmailKind = (typeof orderEmailKindValues)[number];
