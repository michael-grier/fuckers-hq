ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilled_inventory_allocated";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_ready_for_pickup_requires_pickup";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_ready_for_pickup_at_required";--> statement-breakpoint
ALTER TYPE "public"."fulfillment_method" RENAME VALUE 'pickup' TO 'delivery';--> statement-breakpoint
ALTER TYPE "public"."order_status" RENAME VALUE 'ready_for_pickup' TO 'delivery_scheduled';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" RENAME VALUE 'pickup_ready' TO 'delivery_scheduled';--> statement-breakpoint
ALTER TABLE "orders" RENAME COLUMN "ready_for_pickup_at" TO "delivery_scheduled_at";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_inventory_allocated" CHECK ("orders"."status"::text NOT IN ('fulfilled', 'delivery_scheduled') OR "orders"."inventory_status" = 'allocated');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_scheduled_requires_delivery" CHECK ("orders"."status"::text <> 'delivery_scheduled' OR "orders"."fulfillment_method" = 'delivery');--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_scheduled_at_required" CHECK ("orders"."status"::text NOT IN ('delivery_scheduled', 'fulfilled')
        OR "orders"."fulfillment_method" <> 'delivery'
        OR "orders"."delivery_scheduled_at" IS NOT NULL);
