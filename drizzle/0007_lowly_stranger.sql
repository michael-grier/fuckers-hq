ALTER TABLE "product_variants" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "product_variants_product_id_position_idx" ON "product_variants" USING btree ("product_id","position");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_position_nonnegative" CHECK ("product_variants"."position" >= 0);--> statement-breakpoint
-- Backfill: preserve the pre-existing admin display order (SKU ascending) with
-- distinct sequential positions per product so reordering has a stable baseline.
UPDATE "product_variants" AS pv
SET "position" = ranked.new_position
FROM (
  SELECT id, row_number() OVER (PARTITION BY product_id ORDER BY sku ASC) - 1 AS new_position
  FROM "product_variants"
) AS ranked
WHERE pv.id = ranked.id;