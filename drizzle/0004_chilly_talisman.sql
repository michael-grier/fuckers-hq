CREATE TYPE "public"."confirmation_delivery_status" AS ENUM('pending', 'processing', 'retry', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "order_confirmation_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" "confirmation_delivery_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_attempt_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"last_error_code" text,
	"provider_message_id" text,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_confirmation_deliveries_attempt_count_nonnegative" CHECK ("order_confirmation_deliveries"."attempt_count" >= 0),
	CONSTRAINT "order_confirmation_deliveries_sent_at_required" CHECK ("order_confirmation_deliveries"."status" <> 'sent' OR "order_confirmation_deliveries"."delivered_at" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "order_confirmation_deliveries" ADD CONSTRAINT "order_confirmation_deliveries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_confirmation_deliveries_order_id_unique" ON "order_confirmation_deliveries" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_confirmation_deliveries_idempotency_key_unique" ON "order_confirmation_deliveries" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "order_confirmation_deliveries_due_idx" ON "order_confirmation_deliveries" USING btree ("status","next_attempt_at");--> statement-breakpoint
INSERT INTO "order_confirmation_deliveries" (
	"order_id",
	"status",
	"idempotency_key",
	"next_attempt_at",
	"last_error_at",
	"last_error_code",
	"created_at",
	"updated_at"
)
SELECT
	"id",
	'failed'::"confirmation_delivery_status",
	'order-confirmation/' || "id"::text,
	"created_at",
	"created_at",
	'legacy_delivery_unknown',
	"created_at",
	"created_at"
FROM "orders";
