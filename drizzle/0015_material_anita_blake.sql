ALTER TABLE "orders" ADD COLUMN "delivery_review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "delivery_address_check" jsonb;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "delivery_review_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_review_requires_delivery" CHECK (NOT "orders"."delivery_review_required" OR "orders"."fulfillment_method" = 'delivery');--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_delivery_review_requires_delivery" CHECK (NOT "pending_checkouts"."delivery_review_required" OR "pending_checkouts"."fulfillment_method" = 'delivery');--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD CONSTRAINT "pending_checkouts_shipping_has_no_delivery_address" CHECK ("pending_checkouts"."fulfillment_method" = 'delivery' OR "pending_checkouts"."delivery_address_check" IS NULL);