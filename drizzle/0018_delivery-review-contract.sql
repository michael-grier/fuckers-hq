ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_review_method_consistent" CHECK (("orders"."fulfillment_method"::text = 'delivery' AND "orders"."delivery_review_status" IS NOT NULL)
	        OR ("orders"."fulfillment_method"::text = 'shipping' AND "orders"."delivery_review_status" IS NULL)
	        OR ("orders"."fulfillment_method"::text = 'shipping'
	          AND "orders"."delivery_review_status"::text IN ('shipping_payment_received', 'shipping_payment_exception'))) NOT VALID;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_scheduling_requires_approval" CHECK ("orders"."status"::text <> 'delivery_scheduled'
	        OR "orders"."delivery_review_status"::text = 'approved') NOT VALID;--> statement-breakpoint
-- Validate existing rows before removing the compatibility bridge. Any unexpected state aborts the
-- migration without repairing history or leaving the previous writer unprotected.
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_delivery_review_method_consistent";--> statement-breakpoint
ALTER TABLE "orders" VALIDATE CONSTRAINT "orders_delivery_scheduling_requires_approval";--> statement-breakpoint
DROP TRIGGER "orders_legacy_delivery_review_status" ON "orders";--> statement-breakpoint
DROP FUNCTION "set_legacy_delivery_review_status"();
