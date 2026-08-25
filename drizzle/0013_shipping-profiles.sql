CREATE TYPE "public"."shipping_profile" AS ENUM('deck', 'softgood', 'flat');--> statement-breakpoint
CREATE TABLE "shipping_rates" (
	"profile" "shipping_profile" PRIMARY KEY NOT NULL,
	"rate_cents" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipping_rates_rate_cents_nonnegative" CHECK ("shipping_rates"."rate_cents" >= 0)
);
--> statement-breakpoint
INSERT INTO "shipping_rates" ("profile", "rate_cents") VALUES
	('flat', 300),
	('softgood', 1200),
	('deck', 2200);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "shipping_profile" "shipping_profile";--> statement-breakpoint
UPDATE "products"
SET "shipping_profile" = CASE
	WHEN "subcategory" = 'decks' THEN 'deck'::"shipping_profile"
	WHEN "subcategory" = 'stickers' THEN 'flat'::"shipping_profile"
	WHEN "subcategory" IN (
		'trucks',
		'wheels',
		'bearings',
		'griptape',
		'hardware',
		't-shirts',
		'hoodies',
		'jackets',
		'pants',
		'hats',
		'socks',
		'patches',
		'keychains',
		'buttons',
		'papers'
	) THEN 'softgood'::"shipping_profile"
	ELSE NULL
END
WHERE "shipping_profile" IS NULL;--> statement-breakpoint
DO $$
DECLARE
  unmapped text;
BEGIN
  SELECT string_agg(slug || ' (' || subcategory || ')', ', ' ORDER BY slug)
  INTO unmapped
  FROM products
  WHERE shipping_profile IS NULL;

  IF unmapped IS NOT NULL THEN
    RAISE EXCEPTION 'Unclassified products block the shipping-profile migration: %. Assign each product a shipping profile, then re-run.', unmapped;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "shipping_profile" SET NOT NULL;
