# Product category normalization

Migration `0006_normalize-product-categories.sql` updates known product categories to the new
storefront taxonomy.

## Preflight

Run these read-only checks on the target database before applying the migration:

```sql
SELECT id, slug, name, category
FROM products
WHERE category IS NULL
   OR lower(btrim(category)) NOT IN (
     'decks',
     'apparel',
     'accessories',
     'hardgoods',
     'softgoods'
   )
ORDER BY name;

SELECT id, slug, name, category
FROM products
WHERE lower(btrim(category)) = 'accessories'
ORDER BY name;
```

Classify every row returned by the first query manually. Review every legacy Accessories product
because skateboard parts such as bearings, trucks, griptape, and hardware now belong in
Hardgoods. The migration corrects the seeded `precision-bearings` product explicitly but cannot
safely infer other products from their names.

## Migration behavior

- Decks and existing Hardgoods values become `hardgoods`.
- Apparel and existing Softgoods values become `softgoods`.
- Accessories values are normalized to `accessories`.
- The seeded Precision Bearings product becomes `hardgoods`.
- Null and unknown categories remain unchanged so the migration never guesses at product
  classification.

The database column remains nullable text. The admin form and its server-side validator enforce
the three canonical values for future writes.

Apply the migration only through the repository migration command on a reviewed development or
deployment database. Automated verification does not apply it.

## Rollback

No schema rollback is required because older application versions accept text categories. The data
mapping is not safely reversible: Hardgoods now includes both former Decks and former Accessories.
Use a database restore or a reviewed product-by-product update if the taxonomy itself must be
rolled back.
