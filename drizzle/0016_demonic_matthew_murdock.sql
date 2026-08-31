CREATE TYPE "public"."delivery_review_status" AS ENUM('pending', 'approved', 'shipping_payment_pending', 'shipping_payment_received', 'shipping_payment_exception');--> statement-breakpoint
CREATE TYPE "public"."shipping_payment_request_status" AS ENUM('provisioning', 'pending', 'paid', 'expired', 'failed');--> statement-breakpoint
ALTER TYPE "public"."order_email_delivery_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."order_email_kind" ADD VALUE 'shipping_payment_request';--> statement-breakpoint
CREATE TABLE "order_shipping_payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"generation" integer DEFAULT 1 NOT NULL,
	"status" "shipping_payment_request_status" DEFAULT 'provisioning' NOT NULL,
	"amount_cents" integer NOT NULL,
	"tax_cents" integer,
	"total_cents" integer,
	"currency" text NOT NULL,
	"stripe_session_id" text,
	"stripe_payment_intent_id" text,
	"stripe_create_idempotency_key" text NOT NULL,
	"stripe_session_params" jsonb NOT NULL,
	"checkout_url" text,
	"shipping_address" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"paid_at" timestamp with time zone,
	"refund_status" "refund_status" DEFAULT 'none' NOT NULL,
	"refunded_cents" integer DEFAULT 0 NOT NULL,
	"dispute_status" "dispute_status" DEFAULT 'none' NOT NULL,
	"last_error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_shipping_payment_requests_generation_positive" CHECK ("order_shipping_payment_requests"."generation" > 0),
	CONSTRAINT "order_shipping_payment_requests_amount_nonnegative" CHECK ("order_shipping_payment_requests"."amount_cents" >= 0),
	CONSTRAINT "order_shipping_payment_requests_tax_nonnegative" CHECK ("order_shipping_payment_requests"."tax_cents" IS NULL OR "order_shipping_payment_requests"."tax_cents" >= 0),
	CONSTRAINT "order_shipping_payment_requests_total_nonnegative" CHECK ("order_shipping_payment_requests"."total_cents" IS NULL OR "order_shipping_payment_requests"."total_cents" >= 0),
	CONSTRAINT "order_shipping_payment_requests_refunded_nonnegative" CHECK ("order_shipping_payment_requests"."refunded_cents" >= 0),
	CONSTRAINT "order_shipping_payment_requests_refund_not_above_total" CHECK ("order_shipping_payment_requests"."total_cents" IS NULL OR "order_shipping_payment_requests"."refunded_cents" <= "order_shipping_payment_requests"."total_cents"),
	CONSTRAINT "order_shipping_payment_requests_paid_state_consistent" CHECK ((
        "order_shipping_payment_requests"."status" = 'paid'
        AND "order_shipping_payment_requests"."stripe_session_id" IS NOT NULL
        AND "order_shipping_payment_requests"."stripe_payment_intent_id" IS NOT NULL
        AND "order_shipping_payment_requests"."tax_cents" IS NOT NULL
        AND "order_shipping_payment_requests"."total_cents" IS NOT NULL
        AND "order_shipping_payment_requests"."shipping_address" IS NOT NULL
        AND "order_shipping_payment_requests"."paid_at" IS NOT NULL
      ) OR (
        "order_shipping_payment_requests"."status" <> 'paid'
        AND "order_shipping_payment_requests"."stripe_payment_intent_id" IS NULL
        AND "order_shipping_payment_requests"."tax_cents" IS NULL
        AND "order_shipping_payment_requests"."total_cents" IS NULL
        AND "order_shipping_payment_requests"."shipping_address" IS NULL
        AND "order_shipping_payment_requests"."paid_at" IS NULL
        AND "order_shipping_payment_requests"."refund_status" = 'none'
        AND "order_shipping_payment_requests"."refunded_cents" = 0
        AND "order_shipping_payment_requests"."dispute_status" = 'none'
      )),
	CONSTRAINT "order_shipping_payment_requests_linked_state_has_session" CHECK ("order_shipping_payment_requests"."status" NOT IN ('pending', 'paid', 'expired') OR "order_shipping_payment_requests"."stripe_session_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_review_status" "delivery_review_status";--> statement-breakpoint
-- Existing paid delivery orders have not been manually reviewed under the new workflow. Orders
-- already scheduled or completed must be treated as approved so their fulfillment history stays
-- valid; terminal non-fulfillment states no longer need an operator decision.
UPDATE "orders"
SET "delivery_review_status" = CASE
	WHEN "fulfillment_method" = 'delivery' AND "status" = 'paid' THEN 'pending'::"delivery_review_status"
	WHEN "fulfillment_method" = 'delivery' THEN 'approved'::"delivery_review_status"
	ELSE NULL
END;--> statement-breakpoint
ALTER TABLE "order_shipping_payment_requests" ADD CONSTRAINT "order_shipping_payment_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_shipping_payment_requests_order_generation_unique" ON "order_shipping_payment_requests" USING btree ("order_id","generation");--> statement-breakpoint
CREATE UNIQUE INDEX "order_shipping_payment_requests_stripe_session_id_unique" ON "order_shipping_payment_requests" USING btree ("stripe_session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_shipping_payment_requests_payment_intent_id_unique" ON "order_shipping_payment_requests" USING btree ("stripe_payment_intent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_shipping_payment_requests_idempotency_key_unique" ON "order_shipping_payment_requests" USING btree ("stripe_create_idempotency_key");--> statement-breakpoint
CREATE INDEX "order_shipping_payment_requests_status_expires_idx" ON "order_shipping_payment_requests" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "orders_delivery_review_status_idx" ON "orders" USING btree ("delivery_review_status");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_review_method_consistent" CHECK ((
        "orders"."fulfillment_method" = 'delivery'
        AND "orders"."delivery_review_status" IS NOT NULL
      ) OR (
        "orders"."fulfillment_method" = 'shipping'
        AND "orders"."delivery_review_status"::text IS NULL
      ) OR (
        "orders"."fulfillment_method" = 'shipping'
        AND "orders"."delivery_review_status"::text IN ('shipping_payment_received', 'shipping_payment_exception')
      ));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_scheduling_requires_approval" CHECK ("orders"."status"::text <> 'delivery_scheduled'
        OR "orders"."delivery_review_status"::text = 'approved');
