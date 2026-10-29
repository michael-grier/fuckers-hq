# Testing

Use this guide to select checks and prepare a release. Detailed automated expectations belong in
[tests/](tests/) and [e2e/](e2e/); the manual checks below cover provider behavior and device states
those suites cannot fully reproduce. Record results in the pull request or release notes.

## Local development

For a fresh checkout, run `bun install`, copy `.env.example` to `.env.local`, and configure the
required development values described there. Linked worktrees use the
[optional worktree setup](#optional-worktree-setup) below instead of copying env files.

Apply committed migrations to an isolated development database with `bun run db:migrate`, then
start the app with `bun run dev`. Review [migration notes](migrations/README.md) before migrating
an existing database. `bun run db:seed` is for disposable development data.

For local Stripe events, run `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
Configure the listener's signing secret as `STRIPE_WEBHOOK_SECRET` through the coordinated
credential setup. Provider deployment settings belong in [OPERATIONS.md](OPERATIONS.md).

## Local gate

Run the focused check for the change, then:

```bash
bun run lint
bun test
bun run typecheck
bun run build
```

`bun test` includes component and service tests. Postgres tests require
`RESERVATION_TEST_DATABASE_URL` pointing at a disposable database; they create isolated schemas
and skip without it. The [Quality job](.github/workflows/pr-checks.yml) provides ephemeral Postgres.
A passing local run with skips does not establish that the database checks passed.

For a build without local credentials, the Quality job supplies a public Clerk placeholder key.
Use that same value for a compile/prerender check only; authenticated browser testing requires a
real Clerk development instance.

## Optional worktree setup

`.env.local` is gitignored, so a new `git worktree` checkout starts without one. Next.js only
loads env files from its own project root, so the app fails there with
`@clerk/clerk-react: Missing publishableKey`. In each new worktree, run:

```bash
bun install
bun run setup:worktree
```

`setup:worktree` symlinks the main checkout's `.env.local` into the worktree and makes the shared
file read-only. When `NEON_API_KEY` and `NEON_PROJECT_ID` are configured, it also creates or reuses
a Neon branch named after the git branch, generates `.env.development.local` and
`.env.production.local` database overrides, and applies migrations to that isolated database.
Without those credentials, it warns and leaves the worktree using the shared database.

Do not replace the symlink or edit the generated overrides by hand. Rerun `bun run setup:worktree`
to regenerate them. An unexpected `Permission denied` on `.env.local` is the shared-file guard;
credential changes must be coordinated through the main checkout.

After the pull request is merged, run this before removing the worktree:

```bash
bun run teardown:worktree --if-merged
```

It deletes the worktree's Neon branch and generated overrides only when the branch is merged and
the worktree has no uncommitted or unmerged changes. From the main checkout,
`bun run worktree:prune` lists leftover worktree databases; adding `--yes` deletes eligible ones.

## Test environment

For linked worktrees, use [optional worktree setup](#optional-worktree-setup). Confirm the database is isolated
before running browser tests: global setup seeds and mutates its catalog. `E2E_DATABASE_URL` must
match `DATABASE_URL`. Worktree setup supplies that opt-in when it provisions a Neon branch.
Shared database fallback is not an isolated test target.

- Choose an unused loopback port and set matching `PORT` and `E2E_BASE_URL` values. Playwright
  starts its own server and refuses to reuse an occupied port.
- Admin and commerce tests need a Clerk development instance, `E2E_CLERK_USER_EMAIL`, and that
  user's ID in `ADMIN_USER_IDS`.
- Commerce tests need a sandbox `STRIPE_SECRET_KEY` and the same `STRIPE_WEBHOOK_SECRET` in the
  test runner and app. They create real sandbox Sessions, then send synthetic signed events.
  They do not prove that a hosted card payment or deployed webhook configuration works.
- The test runners clear Resend and Sentry credentials. Email rows remain queued without sending;
  inbox delivery and deployed monitoring require separate verification.
- Coordinate credential changes through the main checkout. Regenerate worktree overrides with
  `setup:worktree`; do not replace the shared env symlink or hand-edit generated files.

## Browser tiers

Use an unused port in place of `4317`:

```bash
PORT=4317 E2E_BASE_URL=http://localhost:4317 bun run test:e2e -- --grep @smoke
PORT=4317 E2E_BASE_URL=http://localhost:4317 bun run test:e2e -- --project=admin
PORT=4317 E2E_BASE_URL=http://localhost:4317 bun run test:e2e -- --project=commerce
PORT=4317 E2E_BASE_URL=http://localhost:4317 bun run test:e2e
```

The default suite skips the opt-in hosted-payment and R2 tests. Run these only on explicit request,
with sandbox payments and a dedicated test bucket, despite the script's `live` name. Unlike the
other tiers, they must run on the origin in `NEXT_PUBLIC_APP_URL` (`http://localhost:3000` by
default): Stripe redirects back there after payment, and the test bucket's CORS policy allows only
that origin. Global setup refuses any other origin.

```bash
PORT=3000 E2E_BASE_URL=http://localhost:3000 bun run test:e2e:live
```

See the [e2e skill](.agents/skills/e2e-check/SKILL.md) for prerequisites, failure artifacts, and
cleanup. For visual changes, use the [visual QA skill](.agents/skills/visual-qa/SKILL.md), inspect
mobile, tablet, laptop, and desktop screenshots, and exercise interactive states.

## Coverage map

| Area | Existing coverage |
| --- | --- |
| Catalog, navigation, footer, cart | [Storefront specs](e2e/storefront/), [cart specs](e2e/cart/), component tests in [tests/](tests/) |
| Admin authorization, catalog writes, dashboard | [Admin specs](e2e/admin/), `tests/auth.test.ts`, `tests/admin-*.test.ts*` |
| Checkout, paid orders, delivery review, refunds, stock release | [Commerce specs](e2e/commerce/commerce.spec.ts), `tests/checkout.test.ts`, `tests/webhook.test.ts`, `tests/delivery-review*.test.ts`, `tests/order-restocking-postgres.test.ts` |
| Reservation races, recovery, leases, asynchronous events | `tests/reservations.test.ts`, [Postgres reservation tests](tests/reservations-postgres.test.ts) |
| Email queuing, retries, content, notification isolation | `tests/email.test.ts`, `tests/test-notifications.test.ts`, commerce specs |
| Database constraints, backfills, fulfillment, image cleanup | `tests/*postgres.test.ts`, `tests/orphaned-images.test.ts`, `tests/r2.test.ts` |
| Hosted payment, 3D Secure, direct R2 upload | [Opt-in external specs](e2e/live/live.spec.ts) |
| Request validation, headers, monitoring | `tests/security.test.ts`, `tests/observability.test.ts` |

Flow changes need matching e2e coverage. Update this map when adding a new testing area. Keep
individual assertions in the specs instead of duplicating them here. When a flow cannot be
automated, document its procedure and expected result below and identify the gap in the PR.

## Manual release checks

Run relevant checks after the automated gate. Use sandbox payments, test recipients, and an
isolated database and bucket. Record the commit, environment, browser/device, checks run, and
exceptions without copying credentials or customer data. A documentation change does not authorize
production actions; coordinate deployment and dashboard changes through [OPERATIONS.md](OPERATIONS.md).

### Devices and catalog states

- On a real iPhone, check the footer scroll boundary before and after the browser toolbar
  collapses, including keyboard focus on social links. There must be no blank scroll area below
  the footer. Desktop WebKit cannot reproduce the native browser interface; the original report
  used Chrome on iOS 26.6.1.
- On a phone, edit a new product and stage an image. Save draft and Publish must remain reachable
  above the viewport edge. Repeat with Proton Pass enabled and check for hydration errors.
  This retains the device check from issue #183 without assuming its current resolution status.
- On a disposable catalog, deactivate every product in one category and open its scoped filter
  view. Expect `No filters available for this category.` The component test covers this branch;
  browser specs cannot assume the database contains only their fixtures.
- Play the Videos embed and enter fullscreen on phone, tablet, and desktop. Check playback and
  layout in the actual browser, beyond the static iframe markup.

### Provider behavior

- Run hosted sandbox Checkout and a 3D Secure challenge, either through the opt-in tier or
  manually. Verify the return page, delivered webhook, one paid order, immutable totals and
  item snapshots, and one inventory conversion. Resend the original sandbox event and verify
  no duplicate order, stock change, or successful email delivery.
- With a sandbox tax registration, enable tax for an isolated test deployment and complete a
  taxable order with paid shipping. Verify Stripe applies tax to merchandise and shipping,
  then restore the setting. The deterministic suite cannot configure account registrations.
- With a compatible sandbox delayed-payment method, verify unpaid completion holds reserved
  stock without creating an order. Success must create one order and convert stock once;
  failure must release the hold once. Replay terminal events and verify unchanged counts.
- In a separately configured test deployment, verify customer confirmation, admin sale alert,
  shipment, delivery-scheduled, shipping-payment-request, and refund emails reach test recipients.
  Check their persisted snapshots, destinations, links, and privacy boundaries. Replay events;
  successful deliveries must not resend. Deterministic tests deliberately cannot send email.
- Exercise an out-of-area delivery through a real supplemental shipping payment. Verify the
  original order totals stay immutable, the supplemental payment and address are recorded
  separately, and fulfillment uses the paid shipping address. Expire and replace a link, then
  verify refunding its payment blocks fulfillment for operator review.
- Test direct image upload and deletion against a dedicated non-production R2 bucket. Run the
  orphaned-image job there and verify referenced objects remain while eligible orphans disappear.
- Verify deployed webhook subscriptions, cron authorization, WAF behavior, source-map upload,
  and sanitized Sentry reporting using the operations checklist. Sandbox payments cannot prove
  production Stripe receipt-email settings.

### Failure recovery across services

Use a local breakpoint or temporary reviewed fault on an isolated test app. Restore credentials
through the coordinated setup process, remove faults before committing, and use a fresh reservation
for each case. Let application actions and Stripe events manage inventory counters.

| Fault or event | Expected result |
| --- | --- |
| Definitive Stripe Session rejection | Reservation releases once; on-hand stock is unchanged. |
| Stop after reserving stock but before persisting the Session request | Reconciliation releases the abandoned pre-request hold without a Stripe call. |
| Stop after Stripe creates a Session but before local linkage | Reconciliation reuses the persisted request and idempotency key, links one Session, and does not reserve again. |
| Pay while webhook forwarding is stopped | The redirect alone creates no order. Make only that test reservation due and run reconciliation; it creates one order and converts stock once. Restoring and replaying the webhook changes neither count. |
| Reconcile an open Session or run overlapping workers | Open Sessions retain stock; the lease permits one effective transition. |
| Reject Resend delivery | The order, refund, or fulfillment transition stays committed. Customer delivery stops automatic retries after eight attempts; an authorized retry with the provider restored uses the original key and sends once. |
| Fail an admin sale alert | Paid-order and customer-confirmation records remain committed; the alert stays available for durable retry without becoming a customer-facing admin retry action. |

Before cleaning up test data, verify inventory conversion for successful Sessions and reservation
release for expired or failed Sessions.
Restore changed catalog and provider settings, stop listeners and test servers, and remove generated
artifacts. Record PASS or FAIL and any untested checks in the release notes. Money-path or deployment
exceptions need a second person's review before release.
