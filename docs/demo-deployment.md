# Vercel demo deployment

This runbook publishes a publicly reachable demo while keeping Neon, Stripe, Clerk, Resend,
Cloudflare R2, and Sentry on non-live resources. It is not a production launch: use only Stripe
sandbox keys and test cards, do not fulfill demo orders, and do not enter real customer data beyond
what is necessary for the demonstration.

## Intended release flow

1. A pull request to `main` receives a Vercel Preview deployment and the GitHub `Quality` check.
2. GitHub permits the merge only after `Quality` passes.
3. On push to `main`, the `Deploy Production` workflow first applies pending Drizzle migrations to
   the production database, then deploys the merged commit to Vercel with the CLI.
4. A failing or aborting migration fails the workflow and blocks the deploy, so the running
   application version never gets ahead of the schema it expects.

`vercel.json` disables Vercel's git-driven deploys of `main`, so the workflow is the only
production deploy path. See [migrations/README.md](migrations/README.md) for the migration
runbook and the GitHub Actions secrets the workflow requires.

## 1. Prepare the demo resources

### Neon

- Prefer a dedicated `demo` branch cloned from the current development branch. This keeps local
  experiments from changing the data shown to the brand while still using non-production data.
- Select the demo branch, role, and database in Neon and copy its **pooled** connection string for
  Vercel Functions.
- From a trusted local shell, point `DATABASE_URL` at the demo branch and run:

  ```bash
  bun run db:migrate
  ```

- Do not run migrations as part of `next build` or a Vercel deployment. Apply reviewed migrations
  before deploying code that requires them.
- Run `bun run db:seed` only for a new disposable database. The seed command deliberately updates
  its known products, inventory, and images, so it is not a safe generic reset for an existing
  catalog.

### Stripe sandbox

- Keep the account in a sandbox and copy its `sk_test_...` secret.
- Keep `STRIPE_TAX_ENABLED=false` unless Stripe Tax is configured and deliberately part of the
  demo.
- Choose nonnegative integer-cent shipping values and confirm the allowed countries. Example demo
  values are `SHIPPING_ALLOWED_COUNTRIES=CA,US`, `SHIPPING_STANDARD_RATE_CENTS=1500`, and
  `SHIPPING_FREE_THRESHOLD_CENTS=10000`.
- The deployed webhook is configured after the stable Vercel production URL exists.
- Local delivery is offered only when `DELIVERY_ENABLED=true` and `DELIVERY_AREA_NAME` is set.
  Delivery sessions collect a Canada-only delivery address and carry no shipping rate, so Stripe
  reports zero shipping on them. Because these values are read at build time, changing them
  requires a redeploy.

### Clerk development instance

- Copy the development `pk_test_...` and `sk_test_...` keys.
- Sign in once with the account that will operate the demo and copy its Clerk `user_...` ID.
- Set `ADMIN_USER_IDS` to a comma-separated allowlist of only the people who may use `/admin`.
  A Clerk session alone does not grant admin access.
- A Clerk development instance is acceptable only for this temporary demo. It has a relaxed
  security model, a 100-user cap, development branding, and users cannot later be moved to a
  production instance.

### Cloudflare R2

- Keep using the non-production bucket and an Object Read & Write token scoped only to that bucket.
- Enable the bucket's public development URL, or use an existing non-production custom domain, and
  use that origin as `R2_PUBLIC_URL`.
- Add the exact Vercel production origin to the bucket CORS policy:

  ```json
  [
    {
      "AllowedOrigins": [
        "http://localhost:3000",
        "https://YOUR-PROJECT.vercel.app"
      ],
      "AllowedMethods": ["PUT"],
      "AllowedHeaders": ["Content-Type"],
      "ExposeHeaders": ["ETag"],
      "MaxAgeSeconds": 3600
    }
  ]
  ```

  Origin matching is exact: do not include a trailing slash or path.

### Resend

- Reuse a non-production API key.
- If `EMAIL_FROM` uses `onboarding@resend.dev`, Resend can send only to the email address associated
  with the Resend account. That is enough for a self-demo but not for confirmation email to the
  brand.
- To demonstrate confirmation delivery to other addresses, verify a domain in Resend and use an
  address on that domain for `EMAIL_FROM`.
- Set `SUPPORT_EMAIL` to the reply/support address shown in confirmations.

### Sentry

- Reuse the development Next.js project DSN for the demo.
- Add `SENTRY_ORG`, `SENTRY_PROJECT`, and a narrowly scoped `SENTRY_AUTH_TOKEN` if readable
  production source maps are desired. Without the token, error collection still works but source
  map upload is disabled.

## 2. Import the project into Vercel

1. In the Vercel Pro team, choose **Add New → Project** and import
   `michael-grier/fuckers-hq` through the GitHub integration.
2. Use:
   - Framework Preset: **Next.js**
   - Root Directory: `.`
   - Install Command: leave at the detected default; `bun.lock` makes Vercel use Bun
   - Build Command: `bun run build`
   - Output Directory: leave at the Next.js default
   - Production Branch: `main`
3. Choose a stable project name before the first production deploy. Its generated production URL
   becomes `https://YOUR-PROJECT.vercel.app` and is used by Stripe, R2, and
   `NEXT_PUBLIC_APP_URL`.
4. If Vercel exposes a function-region setting, choose the region closest to the Neon database.
5. Add the Production environment variables from the table below before deploying.

Do not enable **All Deployments** Vercel Authentication for this demo. Stripe must be able to reach
its webhook without a Vercel login. Standard Protection may protect preview/deployment URLs while
leaving the current production domain public.

## 3. Configure Vercel environment variables

Add these in **Project → Settings → Environment Variables**. Mark credential values as Sensitive.
All listed values are required in **Production** for the complete demo except `SENTRY_ORG`,
`SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN`. Those three are required only when readable production
source maps are enabled.

| Variable | Value/source | Sensitive |
| --- | --- | --- |
| `DATABASE_URL` | Neon pooled demo-branch URL | Yes |
| `STRIPE_SECRET_KEY` | Stripe sandbox `sk_test_...` | Yes |
| `STRIPE_WEBHOOK_SECRET` | Add after registering the deployed endpoint | Yes |
| `STRIPE_TAX_ENABLED` | `false` unless sandbox Tax is configured | No |
| `CLERK_SECRET_KEY` | Clerk development `sk_test_...` | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk development `pk_test_...` | No |
| `ADMIN_USER_IDS` | Comma-separated Clerk `user_...` allowlist | Yes |
| `RESEND_API_KEY` | Non-production Resend API key | Yes |
| `EMAIL_FROM` | Sender, e.g. `Fuckers Skateboards <orders@example.com>` | No |
| `SUPPORT_EMAIL` | Support/reply address | No |
| `CRON_SECRET` | Output of `openssl rand -hex 32` | Yes |
| `R2_ACCOUNT_ID` | Cloudflare account ID | Yes |
| `R2_ACCESS_KEY_ID` | Bucket-scoped R2 access key | Yes |
| `R2_SECRET_ACCESS_KEY` | Bucket-scoped R2 secret | Yes |
| `R2_BUCKET` | Non-production bucket name | No |
| `R2_PUBLIC_URL` | Public bucket origin, without trailing slash | No |
| `SENTRY_DSN` | Sentry project DSN | No |
| `NEXT_PUBLIC_SENTRY_DSN` | Same Sentry project DSN | No |
| `SENTRY_ORG` | Sentry organization slug | No |
| `SENTRY_PROJECT` | Sentry project slug | No |
| `SENTRY_AUTH_TOKEN` | Sentry source-map upload token | Yes |
| `NEXT_PUBLIC_APP_URL` | Stable production origin, no trailing slash | No |
| `SHIPPING_ALLOWED_COUNTRIES` | Comma-separated ISO alpha-2 codes, e.g. `CA,US` | No |
| `SHIPPING_STANDARD_RATE_CENTS` | Nonnegative integer cents | No |
| `SHIPPING_FREE_THRESHOLD_CENTS` | Nonnegative integer cents | No |
| `DELIVERY_ENABLED` | `true` to offer local delivery at checkout; defaults to `false` | No |
| `DELIVERY_AREA_NAME` | Service area shown at checkout, e.g. `Rocky View County, Alberta` | No |
| `DELIVERY_INSTRUCTIONS` | Optional extra note shown with the delivery option | No |

For Preview, add only the Clerk development publishable and secret keys if authenticated preview
pages are useful. Keep database, Stripe, R2, Resend, cron, and admin allowlist variables
Production-only unless a separate disposable preview environment is intentionally created. A
preview without `DATABASE_URL` still builds and renders the static shell, but it is not an
integration-test environment.

Environment changes affect only new deployments. Redeploy after adding or changing a value.

## 4. Register the deployed Stripe webhook

After the first successful production deployment:

1. In Stripe Workbench, remain in the sandbox and create an event destination for **Your account**.
2. Use `https://YOUR-PROJECT.vercel.app/api/webhooks/stripe` as the endpoint URL.
3. Subscribe to:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `checkout.session.async_payment_failed`
   - `checkout.session.expired`
   - `charge.refunded`
   - `charge.dispute.created`
   - `charge.dispute.updated`
   - `charge.dispute.closed`
   - `charge.dispute.funds_withdrawn`
   - `charge.dispute.funds_reinstated`
4. Reveal this endpoint's `whsec_...` secret and save it as the Production
   `STRIPE_WEBHOOK_SECRET` in Vercel.
5. Redeploy Production. A Stripe CLI listener secret is different and must not be used for the
   deployed endpoint.

## 5. Protect `main` and gate releases

The repository's `Quality` job runs lint, tests (including ephemeral Postgres integration tests),
typecheck, and build on both pull requests and pushes to `main`.

In **GitHub → Settings → Rules → Rulesets**, edit the ruleset targeting the default branch:

- Require a pull request before merging.
- Require status checks to pass and select `Quality`.
- Require branches to be up to date before merging.
- Require conversation resolution before merging.
- Keep deletion and non-fast-forward updates blocked.
- For a solo-maintainer repository, an approval requirement is optional; the CI requirement is not.

In **Vercel → Project → Settings → Production environment**:

- Confirm Branch Tracking is `main`, so the CLI deploy from the workflow is treated as Production.
- Keep automatic production aliasing enabled. Automatic git deployments of `main` are disabled by
  `vercel.json`; the `Deploy Production` workflow performs the deploy after migrations succeed.

Do not re-enable git-driven production deployments; they would race the workflow's
migrate-then-deploy ordering.

## 6. Verify the deployed demo

Record the commit SHA, Vercel URL, Neon branch, and Stripe sandbox in
[manual-qa.md](manual-qa.md), then complete at least:

1. Open `/products` and confirm active products, prices, images, and stock render.
2. Sign in at `/admin`, create a draft product, add/update a variant, upload an image, activate the
   product, and verify the storefront updates.
3. Confirm a signed-in Clerk user not in `ADMIN_USER_IDS` cannot read or write admin data.
4. Place an order with a Stripe test card and a non-sensitive test address.
5. In Stripe Workbench, confirm the webhook returns `200`.
6. Confirm exactly one order appears in `/admin/orders`, inventory decrements once, and a duplicate
   webhook resend does not create another order or decrement inventory again.
7. Confirm confirmation email is `Sent`, or that a Resend test-sender restriction is recorded as a
   retryable delivery failure without losing the paid order.
8. Confirm both Vercel cron jobs are registered and their latest invocations do not return `401` or
   `500`.
9. Inspect a handled error and confirm the demo deployment reports to Sentry without customer data.

Use Stripe's documented test cards only. Label every demo order clearly and never ship or fulfill
it.

## 7. Roll back and later rotate to live resources

- Vercel rollback: promote the last known-good Production deployment.
- Application rollback does not reverse database migrations. Follow each migration's documented
  rollback order.
- If a demo Checkout Session is open during rollback, let Stripe expire it or verify that
  reservation reconciliation reaches a terminal state before database cleanup.

Before real customers use the site, create or rotate to:

1. A dedicated production Neon branch/project with reviewed migrations and backup/restore policy.
2. Stripe live keys, live Tax/shipping settings, and a separate live webhook secret.
3. A Clerk production instance and new admin user IDs; development users cannot be migrated.
4. A production R2 custom domain and least-privilege production bucket credentials.
5. A verified Resend sending domain and production API key.
6. A production Sentry project/environment and scoped source-map token.
7. Fresh Vercel secrets, production rate-limit rules, a real custom domain, and a complete release
   QA pass.

Rotate one provider at a time, redeploy, and repeat its focused QA before moving to the next.
