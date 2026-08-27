ALTER TYPE "public"."order_inventory_status" ADD VALUE 'released';--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT "orders_fulfilled_inventory_allocated";--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_inventory_resolved" CHECK ("orders"."status"::text NOT IN ('fulfilled', 'delivery_scheduled')
        OR "orders"."inventory_status"::text IN ('allocated', 'released'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_released_inventory_requires_refund" CHECK ("orders"."inventory_status"::text <> 'released' OR "orders"."refund_status"::text <> 'none');