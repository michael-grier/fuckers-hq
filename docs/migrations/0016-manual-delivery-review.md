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

## Contract phase

Migration `0018_delivery-review-contract.sql` completes the rollout. It adds
`orders_delivery_review_method_consistent` and `orders_delivery_scheduling_requires_approval` as
`NOT VALID`, validates both against existing orders, then removes
`orders_legacy_delivery_review_status` and `set_legacy_delivery_review_status`.

Validation runs before bridge removal in the same transaction. An unexpected historical state
therefore aborts the migration without changing the row or removing compatibility.

Before deploying 0018, inspect aggregate state only:

```sql
SELECT fulfillment_method, status, delivery_review_status, COUNT(*)
FROM orders
GROUP BY fulfillment_method, status, delivery_review_status
ORDER BY fulfillment_method, status, delivery_review_status;
```

The audit and migration must reject:

- a delivery order with a null review state;
- a shipping order whose review state is not null, `shipping_payment_received`, or
  `shipping_payment_exception`;
- a scheduled delivery whose review state is not `approved`.

Investigate an unexpected row from its fulfillment history. Do not auto-approve or otherwise infer
the missing decision.

## Deployment and rollback

Deploy the manual-review writer before applying 0018 and confirm rollback to the previous writer is
no longer expected. The production workflow can then apply 0018 before deploying the same or a newer
compatible application version.

After 0018 applies, the pre-manual-review application is not a safe rollback target because it omits
the required review state. A rollback to that writer first needs a reviewed migration that restores
the compatibility function and trigger. Do not drop the supplemental-payment tables, enum values, or
backfilled review column; doing so would discard order history.
