ALTER TABLE "orders" DROP CONSTRAINT "orders_ready_for_pickup_at_required";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_ready_for_pickup_at_required" CHECK ("orders"."status"::text NOT IN ('ready_for_pickup', 'fulfilled')
        OR "orders"."fulfillment_method" <> 'pickup'
        OR "orders"."ready_for_pickup_at" IS NOT NULL);