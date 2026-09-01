ALTER TABLE "orders" ADD COLUMN "destination_province" text;--> statement-breakpoint
-- Prefer the final address from a paid supplemental shipping Checkout when a reviewed local
-- delivery became shipping. Otherwise use the address captured by the original Checkout.
WITH "resolved_destinations" AS (
	SELECT
		"orders"."id",
		COALESCE("final_shipping"."shipping_address", "orders"."shipping_address") -> 'address' AS "address"
	FROM "orders"
	LEFT JOIN LATERAL (
		SELECT "requests"."shipping_address"
		FROM "order_shipping_payment_requests" AS "requests"
		WHERE "requests"."order_id" = "orders"."id"
			AND "requests"."status" = 'paid'
			AND "orders"."fulfillment_method" = 'shipping'
		ORDER BY "requests"."generation" DESC
		LIMIT 1
	) AS "final_shipping" ON true
)
UPDATE "orders"
SET "destination_province" = upper(trim("resolved_destinations"."address" ->> 'state'))
FROM "resolved_destinations"
WHERE "orders"."id" = "resolved_destinations"."id"
	AND upper(trim("resolved_destinations"."address" ->> 'country')) = 'CA'
	AND upper(trim("resolved_destinations"."address" ->> 'state')) IN
		('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT');--> statement-breakpoint
CREATE INDEX "orders_destination_province_created_at_idx" ON "orders" USING btree ("destination_province","created_at");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_destination_province_valid" CHECK ("orders"."destination_province" IS NULL OR "orders"."destination_province" IN
        ('AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'));
