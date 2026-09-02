# Migration 0020: admin new-order email

Migration `0020_admin-new-order-email.sql` adds `admin_new_order` to the transactional order-email
kind enum. New paid orders use it for a second outbox row committed beside the customer
confirmation. Existing orders are not backfilled because that would send stale sale alerts to the
operator.

## Deployment

Set `ADMIN_ORDER_EMAIL` to the sole operational recipient in the Vercel Production environment
before deploying this application version. Keep the address in environment configuration, not in
source control or deployment logs.

The guarded production pipeline applies this enum addition before deploying the application. The
old application does not create `admin_new_order` rows, so it remains compatible during that short
migration-to-deploy window. If the recipient setting is missing or invalid afterward, paid-order
persistence still succeeds. The admin notification remains in the outbox with a normalized
configuration error for cron or manual retry after the setting is fixed. A malformed address fails
the application's environment validation before startup.

After deployment, create one sandbox paid order and confirm the customer confirmation and admin
sale notification have separate delivery rows and provider idempotency keys. Replay the paid event
and confirm neither row is duplicated.

## Rollback

PostgreSQL cannot remove an enum value directly. Once this version has created an
`admin_new_order` row, do not deploy an older application that does not recognize that kind. Roll
forward with a reviewed fix. The enum value and delivery history can remain safely if new admin
notifications must be paused.
