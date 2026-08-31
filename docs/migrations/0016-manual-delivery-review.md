# 0016 manual delivery review

This migration adds the nullable order review state, the supplemental shipping-payment table, its
indexes and constraints, and the new email enum values. Existing paid delivery orders are
backfilled to `pending`; delivery orders that already left the paid state are treated as approved
so their recorded fulfillment history remains valid.

## Expand-phase compatibility

Production applies migrations before deploying the matching application. The previous webhook
does not write `delivery_review_status`, so the migration installs
`orders_legacy_delivery_review_status` for the migration-to-deploy window. It fills a missing
delivery state and treats scheduling through the previous admin workflow as implicit approval.
Shipping orders are unchanged.

The strict order-level method and scheduling checks are deliberately absent from this expand
migration. Adding them now would reject writes from the application version that is still serving
while the migration runs.

## Contract follow-up

After this release is live, a later migration must:

1. Confirm no delivery order has a null review state and no shipping order has an unsupported
   review state.
2. Remove the `orders_legacy_delivery_review_status` trigger and
   `set_legacy_delivery_review_status` function.
3. Add `orders_delivery_review_method_consistent` and
   `orders_delivery_scheduling_requires_approval`.

Before that migration, inspect aggregate state only:

```sql
SELECT fulfillment_method, status, delivery_review_status, COUNT(*)
FROM orders
GROUP BY fulfillment_method, status, delivery_review_status
ORDER BY fulfillment_method, status, delivery_review_status;
```

If the application must be rolled back after 0016 applies, leave this migration in place. The
compatibility trigger keeps the previous writer usable; dropping the new table, enum values, or
backfilled column would make recovery riskier.
