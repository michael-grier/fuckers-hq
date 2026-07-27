UPDATE "products"
SET
	"category" = 'hardgoods',
	"updated_at" = now()
WHERE
	"slug" = 'precision-bearings'
	OR lower(btrim("category")) IN ('decks', 'hardgoods');
--> statement-breakpoint
UPDATE "products"
SET
	"category" = 'softgoods',
	"updated_at" = now()
WHERE lower(btrim("category")) IN ('apparel', 'softgoods');
--> statement-breakpoint
UPDATE "products"
SET
	"category" = 'accessories',
	"updated_at" = now()
WHERE lower(btrim("category")) = 'accessories';
