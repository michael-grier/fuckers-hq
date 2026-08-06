CREATE TYPE "public"."shipping_carrier" AS ENUM('canada_post', 'ups', 'fedex', 'purolator', 'usps', 'dhl', 'other');--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'shipped';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_carrier" "shipping_carrier";--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking_number" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_tracking_pair_complete" CHECK (("orders"."tracking_carrier" IS NULL AND "orders"."tracking_number" IS NULL)
        OR ("orders"."tracking_carrier" IS NOT NULL AND "orders"."tracking_number" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipment_requires_shipping_method" CHECK (("orders"."shipped_at" IS NULL AND "orders"."tracking_number" IS NULL)
        OR "orders"."fulfillment_method" = 'shipping');