# Product subcategories

Migration `0011_product-subcategories.sql` adds the required `products.subcategory` column,
backfills every known product explicitly, makes `category` and `subcategory` non-null, enforces
the canonical parent-child taxonomy with a check constraint, and replaces the category-only index
with a composite `(category, subcategory)` index.

The canonical taxonomy lives in `lib/catalog/categories.ts`:

- Hardgoods: Decks, Trucks, Wheels, Bearings, Griptape, Hardware
- Softgoods: T-Shirts, Hoodies, Jackets, Pants, Hats, Socks
- Accessories: Stickers, Patches, Keychains, Buttons, Papers

Papers extends the taxonomy originally listed in issue #41: the existing Rolling Papers product
fits none of the other accessories subcategories, and the maintainer chose Papers over forcing a
wrong classification.

## Preflight

Run these read-only checks on the target database before applying the migration:

```sql
-- Every product must already have a canonical category.
SELECT id, slug, name, category
FROM products
WHERE category IS NULL
   OR lower(btrim(category)) NOT IN ('hardgoods', 'softgoods', 'accessories')
ORDER BY name;

-- Every product must appear in the migration's explicit slug-to-subcategory mapping.
SELECT id, slug, name, category
FROM products
WHERE slug NOT IN (
  'street-deck-825',
  'blank-deck-825',
  'hardbody-unicorn-princess-deck-825',
  'quasi-johnson-pet-sounds-deck-8375',
  'precision-bearings',
  'bronson-raw-bearings',
  'baker-tee-black',
  'canvas-coach-jacket',
  'carhartt-wip-hoodie-grey',
  'pepper-griptape-9',
  'spitfire-bighead-sticker-pack',
  'rolling-papers'
)
ORDER BY name;
```

Both queries must return zero rows before the migration can succeed. Classify every row returned
by the second query explicitly: decide its canonical category/subcategory pair with a human
review, then extend the migration's explicit `UPDATE` list (or apply a reviewed data fix) before
running it. The migration never infers a subcategory from name patterns; a `DO` block aborts the
whole transaction and lists every unclassified product rather than guessing.

## Migration behavior

1. Adds `subcategory` as a nullable text column.
2. Backfills by exact slug: seeded and reviewed development products map to Decks, Bearings,
   T-Shirts, Jackets, Hoodies, Griptape, Stickers, and Papers as listed in the migration.
3. Aborts with an explicit error listing every product that is still unclassified or holds a
   non-canonical category/subcategory pair.
4. Sets `category` and `subcategory` to `NOT NULL`.
5. Drops `products_category_idx` and creates `products_category_subcategory_idx` on
   `(category, subcategory)`.
6. Adds the `products_category_subcategory_pair` check constraint enforcing the canonical
   parent-child pairs.

## Deployment order

1. Run the preflight queries and resolve any unclassified products.
2. Apply the migration with `bun run db:migrate` on a disposable branch of the target database
   and verify it succeeds there first.
3. Apply the migration to the target database.
4. Deploy the application version that writes `subcategory`.

Between steps 3 and 4, product creation through the previous application version fails because it
does not supply the now-required `subcategory`. Product writes are low-volume and admin-only, so
keep that window short rather than staging the constraint across two releases.

## Rollback

Deploy the previous application version first, then use a reviewed follow-up migration:

```sql
ALTER TABLE products DROP CONSTRAINT products_category_subcategory_pair;
ALTER TABLE products ALTER COLUMN subcategory DROP NOT NULL;
ALTER TABLE products ALTER COLUMN category DROP NOT NULL;
DROP INDEX products_category_subcategory_idx;
CREATE INDEX products_category_idx ON products USING btree (category);
ALTER TABLE products DROP COLUMN subcategory;
```

The backfilled data itself needs no reversal: dropping the column removes it, and `category`
values are untouched by this migration.

This migration was verified on 2026-08-07 against disposable Neon branches of the development
database: with `rolling-papers` deliberately left out of the mapping, the guard aborted and named
it; with the full mapping, the migration applied cleanly, the backfill matched review, and the
constraint rejected a mismatched pair insert.
