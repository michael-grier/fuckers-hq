# Fuckers HQ

Fuckers HQ is a custom storefront for independently sold skate goods. The architecture prioritizes
hosted payments, guest checkout, server-authoritative pricing, and a small maintainable admin
surface.

## Stack

- Next.js 15 App Router
- Bun for local scripts
- Node runtime on Vercel Pro
- Neon Postgres with Drizzle ORM and drizzle-zod
- Clerk for admin-only authentication
- Stripe hosted Checkout and Stripe Tax
- Cloudflare R2 for direct product image uploads
- shadcn/ui-style components with Tailwind CSS
- Zustand and localStorage for cart state
- Resend, React Email, Sentry, and Biome

## Architecture Summary

- The client cart stores purchase intent and display snapshots only.
- Checkout re-reads product prices and available inventory from Postgres, then atomically reserves
  every line before creating a payable Stripe Session.
- Stripe owns payment, tax, and hosted payment UI.
- Orders are created only by the verified Stripe webhook after payment.
- Paid order creation snapshots items and either allocates all inventory or records an explicit
  inventory exception in one transaction.
- `pending_checkouts` bridges Checkout Session creation to the webhook with a short metadata token
  and an immutable copy of the resolved names, prices, quantities, and currency instead of storing
  cart JSON directly in Stripe metadata.
- `inventory_reservations` tracks provisioning, active, asynchronous-payment, conversion, release,
  and reconciliation state. Physical stock, reserved stock, and available stock remain distinct.
- Admin access uses Clerk authentication plus an `ADMIN_USER_IDS` allowlist.

Full detail lives in the [architecture document](docs/architecture.md) and the original
[build plan](docs/build-plan.md).

## Local Setup

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Apply the committed migrations to the local or development database:

   ```bash
   bun run db:migrate
   ```

   Review the migration notes below before updating any shared or deployed database.

4. Start the app:

   ```bash
   bun run dev
   ```

   Creating a hosted Checkout Session also requires a Stripe test secret plus the shipping rate,
   free-shipping threshold, allowed countries, and app URL values documented in `.env.example`.
   Keep `STRIPE_TAX_ENABLED=false` until Stripe Tax is configured, then enable it for production.

5. Run checks:

   ```bash
   bun run lint
   bun test
   bun run typecheck
   bun run build
   ```

   Before a release, complete the reusable [manual QA checklist](docs/manual-qa.md).

For the temporary public sandbox deployment and Git-based release setup, follow the
[Vercel demo deployment runbook](docs/demo-deployment.md).

### Git Worktrees

`.env.local` is gitignored, so a new `git worktree` checkout starts without one. Next.js only
loads env files from its own project root, so the app fails there with
`@clerk/clerk-react: Missing publishableKey`. In each new worktree, run:

```bash
bun install
bun run setup:worktree
```

`setup:worktree` symlinks the main checkout's `.env.local` into the worktree, so credential
updates stay in one place. Because every worktree then writes through to that single file, the
script also drops its write permission. Rotating a credential is therefore:

```bash
chmod +w .env.local   # in the main checkout
# edit
chmod a-w .env.local
```

An unexpected `Permission denied` when writing `.env.local` is this guard, not a broken checkout.
Claude Code additionally refuses to read or write `.env` and `.env*.local` via
`.claude/settings.json`; that covers one agent harness, while the read-only bit covers all of them.

If a worktree needs its own values (for example a separate Stripe webhook secret), delete the
symlink before writing the override:

```bash
rm .env.local
cp .env.example .env.local
```

Editing the linked `.env.local` in place writes through to the main checkout and changes the
credentials every other worktree reads.

## Database

The Drizzle schema lives in `lib/db/schema.ts`, and generated migrations live in `drizzle/`.

```bash
bun run db:generate
bun run db:migrate
bun run db:seed
```

`db:migrate` and `db:seed` require `DATABASE_URL`. The seed script is intended for local or
development databases. Production is migrated automatically by the `Deploy Production` workflow
on every push to `main` — see [docs/migrations/README.md](docs/migrations/README.md); never run
`db:migrate` against production by hand.

Migration `0011_product-subcategories.sql` adds the required `products.subcategory` column with an
explicit slug-based backfill, non-null category columns, a canonical parent-child check
constraint, and a composite `(category, subcategory)` index. It fails rather than guesses when a
product lacks an explicit classification. Review the
[preflight, deployment, and rollback notes](docs/migrations/0011-product-subcategories.md) before
applying it.

Migration `0004_chilly_talisman.sql` adds the confirmation-email delivery outbox. Apply and verify it
on a disposable database branch before deployment, then run it before deploying code that creates
paid orders. Existing orders are backfilled as `failed` with the non-sensitive
`legacy_delivery_unknown` code so the scheduler does not unexpectedly email historical customers;
an administrator may explicitly retry one after checking its delivery history. To roll back, deploy
the previous application first, then use a reviewed follow-up migration to drop
`order_email_deliveries` and `order_email_delivery_status`. Rolling back removes retry
history but does not alter orders or payments.

Migration `0008_local-pickup-fulfillment.sql` adds local pickup. It renames that outbox from
`order_confirmation_deliveries` to `order_email_deliveries` (and its status enum to
`order_email_delivery_status`) because the table now carries the pickup-ready email as well as the
confirmation, keyed by a new `kind` column. The rename preserves every existing row and its
delivery history. It also adds the `ready_for_pickup` order status and the `fulfillment_method`
columns on `orders` and `pending_checkouts`, both defaulting to `shipping` so existing orders are
unaffected. Apply and verify it on a disposable database branch before deployment. To roll back,
deploy the previous application first, then use a reviewed follow-up migration that reverses the
renames; note that Postgres cannot remove the `ready_for_pickup` enum value, so leave it in place.

Migration `0012_local-delivery.sql` converts local pickup into local delivery, which was never
enabled in production. It renames the `pickup` fulfillment method to `delivery`, the
`ready_for_pickup` order status to `delivery_scheduled`, the `pickup_ready` email kind to
`delivery_scheduled`, and the `orders.ready_for_pickup_at` column to `delivery_scheduled_at`,
recreating the three check constraints that referenced the old status text. Enum value renames
rewrite stored rows in place, so any staged pickup orders become scheduled deliveries. To roll
back, deploy the previous application first, then reverse the renames with a reviewed follow-up
migration.

## Stripe Webhooks

Forward sandbox webhook events to the local raw-body endpoint while developing:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Store the listener's `whsec_...` signing secret as `STRIPE_WEBHOOK_SECRET` in `.env.local`.
Verified paid Checkout events always create one idempotent paid order. The transaction locks the
affected reservation and variants, converts every reserved line by decrementing both physical and
reserved quantities, and marks the pending checkout completed. If reservation state is missing or
inconsistent, it preserves the paid order as an inventory exception without a partial decrement.
Inventory exceptions are visible in admin, block fulfillment, and can be retried after an operator
corrects available stock.

Checkout Session creation is a recoverable saga. The database stores the exact Session request
before calling Stripe, uses a stable reservation idempotency key, and exposes the hosted URL only
after local Session linkage succeeds. Confirmed Stripe request rejection releases stock; ambiguous
network or linkage failures remain `provisioning` for reconciliation.

Stripe expiration and asynchronous-payment-failure events release reservations exactly once.
Unpaid completion keeps inventory in `awaiting_payment` until Stripe reports success or failure.
The authenticated `/api/cron/inventory-reservations` job runs every five minutes, claims at most 20
due records with leases, recovers stale provisioning through the original idempotent request, and
retrieves overdue Sessions before converting or releasing stock. It never releases an open Session
from the local clock alone.

Migration `0005_daffy_skullbuster` adds reservation state, normalized reservation lines, and
`product_variants.reserved_qty`. Review the
[deployment and rollback notes](docs/migrations/0005-inventory-reservations.md) before applying it.

Also forward `charge.refunded` and all `charge.dispute.*` lifecycle events. These events are
deduplicated by Stripe event ID and reconciled to orders through the persisted Payment Intent ID.
Refund totals only move forward, while dispute state uses Stripe event time so delayed delivery
cannot overwrite a newer state. Events that arrive before their paid Checkout event are retained
and applied when the order is created.

Fully refunded orders and orders with open, lost, or prevented disputes are excluded from
fulfillment. Partial refunds remain visible to the operator without automatically cancelling the
remaining fulfillment.

Migration `0002_chubby_grandmaster` adds the inventory allocation state and fulfillment constraint.
Its non-null `allocated` default safely backfills existing orders. Deploy the migration before this
application version; for rollback, deploy the previous application first, then remove the
constraint, column, and enum after confirming no inventory-exception orders require reconciliation.

Migration `0001_sweet_zaladane` adds immutable line snapshots without rewriting existing pending
checkouts because their original Checkout names and prices cannot be reconstructed safely from the
mutable catalog. For a zero-overlap rollout, pause new Checkout creation, apply the migration, let
pre-deployment Checkout Sessions expire (up to one hour), deploy the application, and then resume
Checkout. If a legacy Session is paid during rollout, its webhook fails explicitly for manual
Stripe reconciliation instead of recording potentially incorrect receipt lines.

The payment-lifecycle migration adds durable refund and dispute state, a Stripe event ledger, and a
unique Payment Intent lookup. Review its
[deployment and rollback notes](docs/migrations/0003-payment-lifecycle.md) before applying it.

Order creation writes a confirmation delivery record in the same transaction. Delivery starts only
after commit, and verified webhook replays retry an unsent record without recreating the order or
decrementing inventory. Every attempt uses the persisted `order-confirmation/<order-id>` Resend
idempotency key; a successful record cannot be claimed again.

Configure `RESEND_API_KEY`, `EMAIL_FROM`, and `SUPPORT_EMAIL` to enable delivery. Resend failures
are recorded as normalized error codes without copying email payloads or provider error messages
into the outbox. Automatic retries use exponential backoff, stop after eight attempts, and can be
resumed from the protected admin order page.

The Vercel Pro deployment runs `/api/cron/order-confirmations` every five minutes. Generate a
dedicated secret locally, then store the output as the production `CRON_SECRET` in Vercel:

```bash
openssl rand -hex 32
```

Do not commit or reuse this value. Vercel supplies it as a bearer token to the route. The cron
claims at most 20 due deliveries per invocation, and a ten-minute lease permits recovery if an
invocation stops mid-attempt. Vercel cron runs only on production deployments, so invoke the route
with the same bearer header when testing on a disposable local or preview setup.

## Admin Authentication

The `/admin` route requires a Clerk development session and a matching Clerk user ID in the
comma-separated `ADMIN_USER_IDS` allowlist. Configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
`CLERK_SECRET_KEY`, and `ADMIN_USER_IDS` in `.env.local`. Middleware requires authentication, and
the admin server layout independently calls `requireAdmin()` before rendering protected content.
Read-only admin pages are available at `/admin/products` and `/admin/orders`; their database query
helpers also call `requireAdmin()` before reading catalog or order data.

## Cloudflare R2 Product Images

Create an R2 bucket and an Object Read & Write API token scoped to that bucket. Set the five
`R2_*` values documented in `.env.example`; `R2_PUBLIC_URL` must be the bucket's public development
URL or custom-domain base URL, not its S3 API endpoint. Restart the app after changing environment
values.

Each environment with its own database needs its own bucket: local development (the shared dev
database and its worktree branches) and the production deployment must not share one. The nightly
orphaned-image reaper deletes any object its own database does not reference, so a shared bucket
lets production's reaper delete images uploaded through dev (issue #128).

Browser uploads use a short-lived presigned `PUT` URL and go directly to R2. Configure the bucket's
CORS policy to allow the storefront origin, the `PUT` method, and the `Content-Type` header. For
local development, a minimal policy is:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add the production app origin before deployment. See Cloudflare's documentation for
[S3 API tokens](https://developers.cloudflare.com/r2/api/tokens/),
[presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), and
[bucket CORS policies](https://developers.cloudflare.com/r2/buckets/cors/).

## Sentry Error Monitoring

Create a Sentry Next.js project and set `SENTRY_DSN` plus `NEXT_PUBLIC_SENTRY_DSN` to the same
project DSN. The public DSN is an ingest address, not an authentication secret. Error monitoring
runs only in production builds, and only when the corresponding DSN is set: development and test
runs never report, so local activity stays out of the production project. Verifying the wiring
locally means temporarily relaxing that gate in `lib/observability/sentry-enabled.ts`.

The initial configuration collects errors only: tracing, session replay, Sentry logs, and default
PII collection are disabled. Server code should use `captureServerException()` with stable area and
operation labels; do not attach customer details, request bodies, payment data, or secrets.

Readable production stack traces additionally require `SENTRY_ORG`, `SENTRY_PROJECT`, and a secret
`SENTRY_AUTH_TOKEN` in the deployment environment. Source-map generation and upload remain disabled
when the auth token is absent. Never expose `SENTRY_AUTH_TOKEN` through a `NEXT_PUBLIC_*` variable.

## Security Hardening

The app sends a baseline set of browser security headers from `next.config.ts` and uses Clerk's
middleware integration to generate a Clerk-compatible Content Security Policy. The policy blocks
framing and object embeds while allowing the external connections required by Clerk, Sentry, and
direct R2 uploads. Checkout and upload-URL requests must use JSON and have bounded request bodies;
checkout submissions also cap line count and quantity before querying Postgres or calling Stripe.

Production rate limiting belongs at the Vercel Firewall so abusive requests are stopped before a
serverless function, Neon, R2, or Stripe incurs work. Follow the
[Vercel WAF rate-limiting guide](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting)
and, before go-live, publish fixed-window rules keyed by source IP for:

- `POST /api/checkout`: 10 requests per 60 seconds.
- `POST /api/admin/upload-url`: 30 requests per 60 seconds.

Start each rule in log-only mode during final QA, confirm normal checkout and batch image uploads
do not approach the threshold, and then switch the action to rate limit with a `429` response. Do
not apply these rules to the Stripe webhook route; signature verification is its trust boundary,
and Stripe must be able to retry delivery.

## Commit Checkpoints

This build should be committed in small checkpoints:

1. Scaffold and project foundations.
2. Drizzle schema, migrations, validators, and pending checkout contract.
3. Public catalog, product detail, and cart.
4. Stripe Checkout, webhook, order persistence, inventory, and email.
5. Admin auth, product/order management, and R2 uploads.
6. Sentry, testing, QA checklist, and deployment docs.
