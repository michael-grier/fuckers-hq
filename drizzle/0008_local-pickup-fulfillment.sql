CREATE TYPE "public"."fulfillment_method" AS ENUM('shipping', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."order_email_kind" AS ENUM('confirmation', 'pickup_ready');--> statement-breakpoint
ALTER TYPE "public"."confirmation_delivery_status" RENAME TO "order_email_delivery_status";--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'ready_for_pickup' BEFORE 'fulfilled';--> statement-breakpoint
ALTER TABLE "order_confirmation_deliveries" RENAME TO "order_email_deliveries";--> statement-breakpoint
ALTER TABLE "order_email_deliveries" DROP CONSTRAINT "order_confirmation_deliveries_attempt_count_nonnegative";--> statement-breakpoint
ALTER TABLE "order_email_deliveries" DROP CONSTRAINT "order_confirmation_deliveries_sent_at_required";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilled_inventory_allocated";--> statement-breakpoint
ALTER TABLE "order_email_deliveries" DROP CONSTRAINT "order_confirmation_deliveries_order_id_orders_id_fk";
--> statement-breakpoint
DROP INDEX "order_confirmation_deliveries_order_id_unique";--> statement-breakpoint
DROP INDEX "order_confirmation_deliveries_idempotency_key_unique";--> statement-breakpoint
DROP INDEX "order_confirmation_deliveries_due_idx";--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD COLUMN "kind" "order_email_kind" DEFAULT 'confirmation' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fulfillment_method" "fulfillment_method" DEFAULT 'shipping' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "ready_for_pickup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pending_checkouts" ADD COLUMN "fulfillment_method" "fulfillment_method" DEFAULT 'shipping' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_email_deliveries_order_id_kind_unique" ON "order_email_deliveries" USING btree ("order_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "order_email_deliveries_idempotency_key_unique" ON "order_email_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_email_deliveries_due_idx" ON "order_email_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "orders_fulfillment_method_status_idx" ON "orders" USING btree ("fulfillment_method","status");--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_attempt_count_nonnegative" CHECK ("order_email_deliveries"."attempt_count" >= 0);--> statement-breakpoint
ALTER TABLE "order_email_deliveries" ADD CONSTRAINT "order_email_deliveries_sent_at_required" CHECK ("order_email_deliveries"."status" <> 'sent' OR "order_email_deliveries"."delivered_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ready_for_pickup_requires_pickup" CHECK ("orders"."status"::text <> 'ready_for_pickup' OR "orders"."fulfillment_method" = 'pickup');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ready_for_pickup_at_required" CHECK ("orders"."status"::text <> 'ready_for_pickup' OR "orders"."ready_for_pickup_at" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_inventory_allocated" CHECK ("orders"."status"::text NOT IN ('fulfilled', 'ready_for_pickup') OR "orders"."inventory_status" = 'allocated');