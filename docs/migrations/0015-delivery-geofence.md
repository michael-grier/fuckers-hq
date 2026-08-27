# Migration 0015: local-delivery geofence review

Migration `0015_material_anita_blake.sql` adds the checked delivery address and review status needed
by the Rocky View County geofence.

## Data changes

- `pending_checkouts.delivery_address_check` stores the street address and postal code covered by
  the signed, short-lived eligibility proof.
- `pending_checkouts.delivery_review_required` records an ambiguous or near-boundary result.
- `orders.delivery_review_required` carries that status into the delivery queue. Paid conversion
  also sets it when the address entered at Stripe Checkout differs from the checked address.

All new review flags default to `false`; existing orders are unchanged. A legacy delivery checkout
without a stored address is marked for review if it is paid after the new code deploys.

## Deployment

Apply the migration before deploying code that writes these new columns. Configure a random
`DELIVERY_ELIGIBILITY_SECRET` of at least 32 characters in the same release. Delivery stays hidden
without that secret, while shipping checkout remains available.

After deployment, check one known Rocky View address, one Calgary address in a shared postal area,
and a simulated geocoder failure. The first should offer delivery; the others should leave shipping
selected without reserving inventory.

## Rollback

Deploy the previous application first, then drop the two pending-checkout columns and the order
review column with their three constraints. This removes address-review history but does not change
payments, inventory, fulfillment state, or customer addresses already stored on orders.
