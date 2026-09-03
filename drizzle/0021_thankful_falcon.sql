ALTER TABLE "orders" ADD COLUMN "shipping_actual_cost_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_actual_cost_unknown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "packed_weight_grams" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "packed_weight_unknown" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- These shipments predate capture, so their label cost and packed weight cannot be reconstructed
-- safely. Mark both facts unknown before enforcing the fulfilled-order contract.
UPDATE "orders"
SET "shipping_actual_cost_unknown" = true,
    "packed_weight_unknown" = true
WHERE "status"::text = 'fulfilled'
  AND "fulfillment_method"::text = 'shipping';--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_actual_cost_nonnegative" CHECK ("orders"."shipping_actual_cost_cents" IS NULL OR "orders"."shipping_actual_cost_cents" >= 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shipping_actual_cost_state_consistent" CHECK (NOT ("orders"."shipping_actual_cost_unknown" AND "orders"."shipping_actual_cost_cents" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_weight_positive" CHECK ("orders"."packed_weight_grams" IS NULL OR "orders"."packed_weight_grams" > 0);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_packed_weight_state_consistent" CHECK (NOT ("orders"."packed_weight_unknown" AND "orders"."packed_weight_grams" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_fulfilled_shipping_record_complete" CHECK ("orders"."status"::text <> 'fulfilled'
        OR "orders"."fulfillment_method" <> 'shipping'
        OR (
          ("orders"."shipping_actual_cost_cents" IS NOT NULL OR "orders"."shipping_actual_cost_unknown")
          AND ("orders"."packed_weight_grams" IS NOT NULL OR "orders"."packed_weight_unknown")
        ));
