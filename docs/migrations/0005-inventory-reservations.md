# Inventory reservation rollout

Migration `0005_daffy_skullbuster.sql` adds durable inventory reservations for Stripe Checkout.

## Schema and backfill

- `product_variants.reserved_qty` is non-null with a default of `0`, so existing variants are
  backfilled without a separate data update.
- Database checks keep `reserved_qty` non-negative and no greater than physical
  `inventory_qty`.
- `inventory_reservations` owns the request-ID, pending-checkout, Stripe Session, Stripe
  idempotency, lifecycle, expiry, and reconciliation-lease constraints.
- `inventory_reservation_items` normalizes quantities by reservation and immutable variant-ID
  snapshot. Its live `variant_id` foreign key uses `ON DELETE RESTRICT` while a reservation is
  non-terminal. Conversion and release clear that live link after changing stock, while retaining
  `variant_id_snapshot` for audit history.
- Unique indexes prevent duplicate request IDs, pending-checkout links, reservation tokens, Stripe
  Session IDs, and Stripe create idempotency keys.
- The reconciliation index supports bounded status and due-time scans.

No existing pending Checkout Session can be reconstructed into a safe reservation. Because the
application is not live, use a coordinated rollout with no legacy in-flight Sessions:

1. Prevent new Checkout creation.
2. Let existing Sessions expire and confirm their paid webhooks have been reconciled.
3. Apply migration `0005_daffy_skullbuster.sql` on an isolated development branch and verify the
   checks and indexes.
4. Apply the migration to the deployment database.
5. Deploy the reservation-aware application and its five-minute reconciliation cron.
6. Re-enable Checkout and perform Stripe test-mode QA.

Do not deploy the new application before the migration. Do not apply this migration to production
from an automated test or implementation task.

The PR workflow runs `tests/reservations-postgres.test.ts` against an ephemeral Postgres service.
For the same check locally, point `RESERVATION_TEST_DATABASE_URL` at a disposable database; the
test creates and removes its own uniquely named schema.

Stripe retains idempotency results for at least 24 hours. Reconciliation retries the exact
persisted request within that guaranteed window. If an unlinked provisioning record survives
beyond it, the worker retains stock and records a retryable reconciliation error for operator
review instead of risking a new Session or releasing stock for an older paid Session.

## Rollback

Rollback requires a coordinated maintenance window:

1. Stop new Checkout creation.
2. Allow reconciliation to convert or release every `provisioning`, `active`, and
   `awaiting_payment` reservation. Confirm every variant has `reserved_qty = 0`.
3. Expire any remaining open Stripe Sessions through a reviewed operational procedure and wait for
   their events.
4. Deploy the previous application version.
5. Apply a reviewed follow-up migration that drops `inventory_reservation_items`, then
   `inventory_reservations`, then `product_variants.reserved_qty`, and finally
   `inventory_reservation_status`.

Dropping reservation tables removes lifecycle audit history. Never remove `reserved_qty` while a
non-terminal reservation exists, because the previous application cannot protect that stock.
