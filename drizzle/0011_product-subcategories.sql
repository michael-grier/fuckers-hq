-- Add the subcategory column as nullable first so every existing row can be classified
-- explicitly before the NOT NULL and taxonomy constraints are enforced.
ALTER TABLE "products" ADD COLUMN "subcategory" text;--> statement-breakpoint
-- Explicit classification of every product known when this migration was authored: the seed
-- catalog plus the reviewed development catalog. Matches are exact slugs only; this migration
-- never infers a subcategory from name patterns, and the guard below aborts for unmapped rows.
UPDATE "products" SET "subcategory" = 'decks' WHERE "subcategory" IS NULL AND "slug" IN ('street-deck-825', 'blank-deck-825', 'hardbody-unicorn-princess-deck-825', 'quasi-johnson-pet-sounds-deck-8375');--> statement-breakpoint
UPDATE "products" SET "subcategory" = 'bearings' WHERE "subcategory" IS NULL AND "slug" IN ('precision-bearings', 'bronson-raw-bearings');--> statement-breakpoint
UPDATE "products" SET "subcategory" = 't-shirts' WHERE "subcategory" IS NULL AND "slug" = 'baker-tee-black';--> statement-breakpoint
UPDATE "products" SET "subcategory" = 'jackets' WHERE "subcategory" IS NULL AND "slug" = 'canvas-coach-jacket';--> statement-breakpoint
UPDATE "products" SET "subcategory" = 'hoodies' WHERE "subcategory" IS NULL AND "slug" = 'carhartt-wip-hoodie-grey';--> statement-breakpoint
UPDATE "products" SET "subcategory" = 'griptape' WHERE "subcategory" IS NULL AND "slug" = 'pepper-griptape-9';--> statement-breakpoint
UPDATE "products" SET "subcategory" = 'stickers' WHERE "subcategory" IS NULL AND "slug" = 'spitfire-bighead-sticker-pack';--> statement-breakpoint
-- Fail loudly instead of guessing: any product left without an explicit canonical
-- category/subcategory pair aborts the migration and is listed for manual classification.
DO $$
DECLARE
  unmapped text;
BEGIN
  SELECT string_agg(
    format('%s (category=%s, subcategory=%s)', slug, coalesce(category, 'NULL'), coalesce(subcategory, 'NULL')),
    '; ' ORDER BY slug
  )
  INTO unmapped
  FROM products
  WHERE category IS NULL
     OR subcategory IS NULL
     OR NOT (
       (category = 'hardgoods' AND subcategory IN ('decks', 'trucks', 'wheels', 'bearings', 'griptape', 'hardware'))
       OR (category = 'softgoods' AND subcategory IN ('t-shirts', 'hoodies', 'jackets', 'pants', 'hats', 'socks'))
       OR (category = 'accessories' AND subcategory IN ('stickers', 'patches', 'keychains', 'buttons'))
     );

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'Unclassified products block the subcategory migration: %. Classify each product explicitly per docs/migrations/0011-product-subcategories.md, then re-run.', unmapped;
  END IF;
END $$;--> statement-breakpoint
DROP INDEX "products_category_idx";--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "category" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "subcategory" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "products_category_subcategory_idx" ON "products" USING btree ("category","subcategory");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_subcategory_pair" CHECK (("category" = 'hardgoods' AND "subcategory" IN ('decks', 'trucks', 'wheels', 'bearings', 'griptape', 'hardware')) OR ("category" = 'softgoods' AND "subcategory" IN ('t-shirts', 'hoodies', 'jackets', 'pants', 'hats', 'socks')) OR ("category" = 'accessories' AND "subcategory" IN ('stickers', 'patches', 'keychains', 'buttons')));
