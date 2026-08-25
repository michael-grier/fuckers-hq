# Migration 0013: shipping profiles

Migration `0013_shipping-profiles.sql` adds a required shipping profile to every product and creates
the database-backed shipping rate table used by Checkout.

## Backfill

- Decks become `deck`.
- Stickers become `flat`.
- Every other canonical subcategory becomes `softgood`, the safer parcel rate.

The migration stops before making the column required if it finds a product with an unknown
subcategory. Assign those rows explicitly, then run the migration again. The rate table starts at
300 cents for `flat`, 1,200 cents for `softgood`, and 2,200 cents for `deck`.

## Deployment

Apply the migration before deploying code that reads `products.shipping_profile` or
`shipping_rates`. New Checkout Sessions snapshot the selected rate, so changing a row in
`shipping_rates` affects new sessions only. Existing hosted sessions keep the charge already sent
to Stripe.

## Rollback

Deploy the previous application first. Then drop `shipping_rates`, drop
`products.shipping_profile`, and drop the `shipping_profile` enum. This removes the configured
rates and every product assignment, so record them before rolling back if they may be needed again.
