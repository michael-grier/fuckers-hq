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
import { type ShippingProfile, shippingProfileValues } from "@/lib/catalog/shipping-profiles";
import { shippingCarrierValues } from "@/lib/orders/shipping-carriers";

export const productStatusValues = ["draft", "active", "archived"] as const;
// `fulfilled` is the terminal state for both methods: shipped for shipping, dropped off for
// local delivery.
export const orderStatusValues = [
  "pending",
  "paid",
  "delivery_scheduled",
  "fulfilled",
  "cancelled",
  "refunded",
] as const;
export const orderInventoryStatusValues = ["allocated", "exception", "released"] as const;
export const fulfillmentMethodValues = ["shipping", "delivery"] as const;
export const deliveryReviewStatusValues = [
  "pending",
  "approved",
  "shipping_payment_pending",
  "shipping_payment_received",
  "shipping_payment_exception",
] as const;
export const shippingPaymentRequestStatusValues = [
  "provisioning",
  "pending",
  "paid",
  "expired",
  "failed",
] as const;
export const orderEmailKindValues = [
  "confirmation",
  "delivery_scheduled",
  "shipped",
  "shipping_payment_request",
] as const;
export const refundStatusValues = ["none", "partial", "full"] as const;
export const disputeStatusValues = ["none", "open", "won", "lost", "prevented"] as const;
export const stripePaymentEventKindValues = ["refund", "dispute"] as const;
export const orderEmailDeliveryStatusValues = [
  "pending",
  "processing",
  "retry",
  "sent",
  "failed",
  "cancelled",
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
export const deliveryReviewStatus = pgEnum("delivery_review_status", deliveryReviewStatusValues);
export const shippingPaymentRequestStatus = pgEnum(
  "shipping_payment_request_status",
  shippingPaymentRequestStatusValues,
);
export const shippingProfile = pgEnum("shipping_profile", shippingProfileValues);
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
  // Optional only for paid checkouts created before shipping profiles existed. Every new
  // reservation writes both fields before it can create a Stripe Session.
  shippingProfile?: ShippingProfile;
  shippingRateCents?: number;
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
    shippingProfile: shippingProfile("shipping_profile").notNull(),
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

/** Runtime-editable checkout rates keyed by the shipping profile assigned to each product. */
export const shippingRates = pgTable(
  "shipping_rates",
  {
    profile: shippingProfile("profile").primaryKey(),
    rateCents: integer("rate_cents").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [check("shipping_rates_rate_cents_nonnegative", sql`${table.rateCents} >= 0`)],
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
    // Original shipping orders keep this null. Local-delivery orders retain their review history
    // even when a supplemental payment converts them to shipping.
    deliveryReviewStatus: deliveryReviewStatus("delivery_review_status"),
    deliveryScheduledAt: timestamp("delivery_scheduled_at", { withTimezone: true }),
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
    index("orders_delivery_review_status_idx").on(table.deliveryReviewStatus),
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
      "orders_fulfilled_inventory_resolved",
      sql`${table.status}::text NOT IN ('fulfilled', 'delivery_scheduled')
        OR ${table.inventoryStatus}::text IN ('allocated', 'released')`,
    ),
    // Releasing an order makes its units sellable again, so it is valid only after Stripe has
    // recorded some refund. The application decides whether that refund warrants a stock return.
    check(
      "orders_released_inventory_requires_refund",
      sql`${table.inventoryStatus}::text <> 'released' OR ${table.refundStatus}::text <> 'none'`,
    ),
    check(
      "orders_delivery_scheduled_requires_delivery",
      sql`${table.status}::text <> 'delivery_scheduled' OR ${table.fulfillmentMethod} = 'delivery'`,
    ),
    check(
      "orders_delivery_review_method_consistent",
      sql`(
        ${table.fulfillmentMethod} = 'delivery'
        AND ${table.deliveryReviewStatus} IS NOT NULL
      ) OR (
        ${table.fulfillmentMethod} = 'shipping'
        AND ${table.deliveryReviewStatus}::text IS NULL
      ) OR (
        ${table.fulfillmentMethod} = 'shipping'
        AND ${table.deliveryReviewStatus}::text IN ('shipping_payment_received', 'shipping_payment_exception')
      )`,
    ),
    check(
      "orders_delivery_scheduling_requires_approval",
      sql`${table.status}::text <> 'delivery_scheduled'
        OR ${table.deliveryReviewStatus}::text = 'approved'`,
    ),
    // The timestamp survives drop-off so the admin history keeps how long the order waited.
    // Covers `fulfilled` as well, so a delivery order cannot reach its terminal state without the
    // scheduling step that told the customer to expect it. The application already enforces the
    // paid -> delivery_scheduled -> fulfilled path; this keeps a direct write from bypassing it.
    check(
      "orders_delivery_scheduled_at_required",
      sql`${table.status}::text NOT IN ('delivery_scheduled', 'fulfilled')
        OR ${table.fulfillmentMethod} <> 'delivery'
        OR ${table.deliveryScheduledAt} IS NOT NULL`,
    ),
    // A number without a carrier cannot produce a tracking link, and a carrier without a number
    // tells the customer nothing, so a half-recorded shipment is rejected outright.
    check(
      "orders_tracking_pair_complete",
      sql`(${table.trackingCarrier} IS NULL AND ${table.trackingNumber} IS NULL)
        OR (${table.trackingCarrier} IS NOT NULL AND ${table.trackingNumber} IS NOT NULL)`,
    ),
    // Shipment facts only exist for shipping orders; a delivery order is handed over in person.
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

/**
 * One durable supplemental shipping-charge request per local-delivery order.
 *
 * `generation` advances when an expired or definitively failed Checkout Session is replaced. The
 * original order totals stay immutable; Stripe tax and the final amount paid live on this record.
 */
export const orderShippingPaymentRequests = pgTable(
  "order_shipping_payment_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    generation: integer("generation").notNull().default(1),
    status: shippingPaymentRequestStatus("status").notNull().default("provisioning"),
    amountCents: integer("amount_cents").notNull(),
    taxCents: integer("tax_cents"),
    totalCents: integer("total_cents"),
    currency: text("currency").notNull(),
    stripeSessionId: text("stripe_session_id"),
    stripePaymentIntentId: text("stripe_payment_intent_id"),
    stripeCreateIdempotencyKey: text("stripe_create_idempotency_key").notNull(),
    stripeSessionParams: jsonb("stripe_session_params").$type<JsonRecord>().notNull(),
    checkoutUrl: text("checkout_url"),
    shippingAddress: jsonb("shipping_address").$type<JsonRecord | null>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    refundStatus: refundStatus("refund_status").notNull().default("none"),
    refundedCents: integer("refunded_cents").notNull().default(0),
    disputeStatus: disputeStatus("dispute_status").notNull().default("none"),
    lastErrorCode: text("last_error_code"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("order_shipping_payment_requests_order_generation_unique").on(
      table.orderId,
      table.generation,
    ),
    uniqueIndex("order_shipping_payment_requests_stripe_session_id_unique").on(
      table.stripeSessionId,
    ),
    uniqueIndex("order_shipping_payment_requests_payment_intent_id_unique").on(
      table.stripePaymentIntentId,
    ),
    uniqueIndex("order_shipping_payment_requests_idempotency_key_unique").on(
      table.stripeCreateIdempotencyKey,
    ),
    index("order_shipping_payment_requests_status_expires_idx").on(table.status, table.expiresAt),
    check("order_shipping_payment_requests_generation_positive", sql`${table.generation} > 0`),
    check("order_shipping_payment_requests_amount_nonnegative", sql`${table.amountCents} >= 0`),
    check(
      "order_shipping_payment_requests_tax_nonnegative",
      sql`${table.taxCents} IS NULL OR ${table.taxCents} >= 0`,
    ),
    check(
      "order_shipping_payment_requests_total_nonnegative",
      sql`${table.totalCents} IS NULL OR ${table.totalCents} >= 0`,
    ),
    check("order_shipping_payment_requests_refunded_nonnegative", sql`${table.refundedCents} >= 0`),
    check(
      "order_shipping_payment_requests_refund_not_above_total",
      sql`${table.totalCents} IS NULL OR ${table.refundedCents} <= ${table.totalCents}`,
    ),
    check(
      "order_shipping_payment_requests_paid_state_consistent",
      sql`(
        ${table.status} = 'paid'
        AND ${table.stripeSessionId} IS NOT NULL
        AND ${table.stripePaymentIntentId} IS NOT NULL
        AND ${table.taxCents} IS NOT NULL
        AND ${table.totalCents} IS NOT NULL
        AND ${table.shippingAddress} IS NOT NULL
        AND ${table.paidAt} IS NOT NULL
      ) OR (
        ${table.status} <> 'paid'
        AND ${table.stripePaymentIntentId} IS NULL
        AND ${table.taxCents} IS NULL
        AND ${table.totalCents} IS NULL
        AND ${table.shippingAddress} IS NULL
        AND ${table.paidAt} IS NULL
        AND ${table.refundStatus} = 'none'
        AND ${table.refundedCents} = 0
        AND ${table.disputeStatus} = 'none'
      )`,
    ),
    check(
      "order_shipping_payment_requests_linked_state_has_session",
      sql`${table.status} NOT IN ('pending', 'paid', 'expired') OR ${table.stripeSessionId} IS NOT NULL`,
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
  shippingPaymentRequests: many(orderShippingPaymentRequests),
}));

export const orderShippingPaymentRequestsRelations = relations(
  orderShippingPaymentRequests,
  ({ one }) => ({
    order: one(orders, {
      fields: [orderShippingPaymentRequests.orderId],
      references: [orders.id],
    }),
  }),
);

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
export type OrderShippingPaymentRequest = typeof orderShippingPaymentRequests.$inferSelect;
export type NewOrderShippingPaymentRequest = typeof orderShippingPaymentRequests.$inferInsert;
export type OrderItem = typeof orderItems.$inferSelect;
export type NewOrderItem = typeof orderItems.$inferInsert;
export type StripePaymentEvent = typeof stripePaymentEvents.$inferSelect;
export type NewStripePaymentEvent = typeof stripePaymentEvents.$inferInsert;
export type OrderEmailDelivery = typeof orderEmailDeliveries.$inferSelect;
export type NewOrderEmailDelivery = typeof orderEmailDeliveries.$inferInsert;
export type FulfillmentMethod = (typeof fulfillmentMethodValues)[number];
export type DeliveryReviewStatus = (typeof deliveryReviewStatusValues)[number];
export type OrderEmailKind = (typeof orderEmailKindValues)[number];
