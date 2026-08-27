# Migration 0015: refunded inventory release

Migration `0015_sour_banshee.sql` adds `released` to `order_inventory_status`. It also replaces the
fulfillment constraint so refunded, completed orders may record returned stock while inventory
exceptions remain blocked from fulfillment. A second constraint prevents `released` on an order
with no refund.

## Before deployment

- Apply the migration to a disposable Neon branch and run the refund inventory Postgres and
  commerce tests.
- Count existing orders with a refund and `inventory_status = 'allocated'`. Review them manually.
  Do not backfill them automatically because an operator may already have corrected catalog stock.
- Deploy the migration before code that writes `inventory_status = 'released'`.

## Verification

- Confirm `order_inventory_status` contains `allocated`, `exception`, and `released`.
- Confirm an unfulfilled full refund changes the order to `released` and increments every linked
  variant by its persisted order quantity in one transaction.
- Confirm partial refunds and refunds after fulfillment remain `allocated` until the admin action
  runs.
- Replay both the refund webhook and admin action and confirm neither can increment stock twice.

## Rollback

Deploy the previous application first. Before restoring the old fulfillment constraint, resolve or
reclassify every `released` order because the old constraint rejects that state on fulfilled and
delivery-scheduled orders. PostgreSQL cannot remove an enum value safely in place, so leave
`released` in the enum. A reviewed follow-up migration may drop the new constraints and restore
`orders_fulfilled_inventory_allocated` after no row depends on the new state.
