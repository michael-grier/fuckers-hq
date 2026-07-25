CREATE TYPE "public"."inventory_reservation_status" AS ENUM('provisioning', 'active', 'awaiting_payment', 'converted', 'released');--> statement-breakpoint
CREATE TABLE "inventory_reservation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"variant_id" uuid,
	"variant_id_snapshot" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "inventory_reservation_items_quantity_positive" CHECK ("inventory_reservation_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "inventory_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"request_id" uuid NOT NULL,
	"pending_checkout_id" uuid NOT NULL,
	"stripe_session_id" text,
	"stripe_create_idempotency_key" text NOT NULL,
	"stripe_session_params" jsonb,
	"status" "inventory_reservation_status" DEFAULT 'provisioning' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"converted_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"release_reason" text,
	"next_reconcile_at" timestamp with time zone NOT NULL,
	"reconcile_lease_until" timestamp with time zone,
	"reconcile_attempt_count" integer DEFAULT 0 NOT NULL,
	"last_reconcile_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reservations_attempt_count_nonnegative" CHECK ("inventory_reservations"."reconcile_attempt_count" >= 0),
	CONSTRAINT "inventory_reservations_terminal_state_consistent" CHECK ((
        "inventory_reservations"."status" = 'converted'
        AND "inventory_reservations"."converted_at" IS NOT NULL
        AND "inventory_reservations"."released_at" IS NULL
        AND "inventory_reservations"."release_reason" IS NULL
      ) OR (
        "inventory_reservations"."status" = 'released'
        AND "inventory_reservations"."converted_at" IS NULL
        AND "inventory_reservations"."released_at" IS NOT NULL
        AND "inventory_reservations"."release_reason" IS NOT NULL
      ) OR (
        "inventory_reservations"."status" IN ('provisioning', 'active', 'awaiting_payment')
        AND "inventory_reservations"."converted_at" IS NULL
        AND "inventory_reservations"."released_at" IS NULL
        AND "inventory_reservations"."release_reason" IS NULL
      )),
	CONSTRAINT "inventory_reservations_linked_state_has_session" CHECK ("inventory_reservations"."status" NOT IN ('active', 'awaiting_payment', 'converted') OR "inventory_reservations"."stripe_session_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "reserved_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_reservation_id_inventory_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."inventory_reservations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservation_items" ADD CONSTRAINT "inventory_reservation_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reservations" ADD CONSTRAINT "inventory_reservations_pending_checkout_id_pending_checkouts_id_fk" FOREIGN KEY ("pending_checkout_id") REFERENCES "public"."pending_checkouts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservation_items_reservation_variant_unique" ON "inventory_reservation_items" USING btree ("reservation_id","variant_id_snapshot");--> statement-breakpoint
CREATE INDEX "inventory_reservation_items_variant_id_idx" ON "inventory_reservation_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_token_unique" ON "inventory_reservations" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_request_id_unique" ON "inventory_reservations" USING btree ("request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_pending_checkout_id_unique" ON "inventory_reservations" USING btree ("pending_checkout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_stripe_session_id_unique" ON "inventory_reservations" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_reservations_stripe_idempotency_key_unique" ON "inventory_reservations" USING btree ("stripe_create_idempotency_key");--> statement-breakpoint
CREATE INDEX "inventory_reservations_reconcile_due_idx" ON "inventory_reservations" USING btree ("status","next_reconcile_at");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_reserved_qty_nonnegative" CHECK ("product_variants"."reserved_qty" >= 0);--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_reserved_qty_not_above_inventory" CHECK ("product_variants"."reserved_qty" <= "product_variants"."inventory_qty");