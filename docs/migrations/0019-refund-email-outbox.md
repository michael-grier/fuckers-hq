# Migration 0019: refund email outbox

Migration `0019_refund-email-outbox.sql` lets the transactional email outbox retain more than one
refund notice for an order. It adds the `refund` email kind and two nullable integer snapshots:
the newly refunded amount and Stripe's cumulative refunded amount.

The replacement uniqueness rule keeps non-refund email kinds as singletons by treating null
cumulative amounts as equal. Refund rows are unique at each cumulative amount. A check constraint
requires both positive snapshots on refund rows and forbids them on every other email kind.

## Backfill and verification

There is no historical refund-email backfill. Existing refund events may predate the branded
mailer, and sending them now would surprise customers. Existing email rows retain null refund
snapshots and remain valid singleton deliveries.

Before deployment, apply the migration to a disposable Neon branch and verify aggregate state:

```sql
SELECT kind, COUNT(*)
FROM order_email_deliveries
GROUP BY kind
ORDER BY kind;
```

After sandbox refund testing, verify that each advancing cumulative amount created one row and
that exact replays or lower cumulative amounts created none. Do not include customer addresses or
provider payloads in deployment logs.

## Deployment

The migration drops the old `(order_id, kind)` unique index before adding the three-column
`UNIQUE NULLS NOT DISTINCT` rule. The previous application names the old two-column index as its
conflict target, so email-queuing writes from that version are not compatible during the short
migrate-to-deploy window. This single-release contract change is accepted only because the store
has not launched and has no users; do not reuse this rollout shape once the site accepts traffic.

Production applies the migration automatically before deploying the matching application. Do not
run it against production by hand. Keep Stripe's refund emails enabled through deployment and
sandbox verification, then disable them in Stripe so customers do not receive duplicate notices.

## Rollback

The previous application is not a safe rollback target after this migration, because it expects
the removed two-column uniqueness rule. Roll forward with a reviewed fix. PostgreSQL cannot remove
the added enum value directly, and refund delivery rows are operational history that must not be
deleted merely to recreate the old index.

If the new application must be disabled, first deploy a compatible revision that stops creating
refund rows but retains the three-column conflict targets. The nullable columns, enum value,
constraint, and delivery history can remain in place safely.
