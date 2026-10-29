# Operations

Use this runbook for deployment, provider verification, and account handoff. Configuration keys and
validation live in [.env.example](.env.example) and [lib/env.ts](lib/env.ts); local setup lives in
[TESTING.md](TESTING.md#local-development). Verify dashboard state when doing operational work instead of treating this
file as a record of which setup tasks are complete.

## Deployment and recovery

The [Ship main workflow](.github/workflows/deploy-production.yml) migrates production before
deploying the same commit to Vercel. It also migrates the shared dev database in an independent
job. Follow the [migration runbook](migrations/README.md) for credentials, failed migrations,
compatibility, and rollback. `vercel.json` disables automatic git deployment of `main` so it cannot
race this ordering.

- Before merging, verify required PR checks and review the migration notes for the change.
- On GitHub, require the `Quality` check, an up-to-date branch, and resolved review conversations.
  Verify the ruleset rather than assuming committed workflow files enforce merge protection.
- After merging, check the migration and deploy jobs separately. A failed deploy can leave the
  previous application serving against the newly migrated schema.
- A manual workflow dispatch must target `main`. Use `force_no_build_cache` when deliberately
  rebuilding without Vercel's existing build cache.
- Application rollback does not undo migrations. Verify schema compatibility before promoting an
  older deployment. Preserve paid-order and delivery history; use a reviewed forward fix when
  older code no longer supports the schema.

## Environment boundaries

Production and test deployments need separate databases, Stripe credentials and webhook secrets,
Clerk instances, R2 buckets, and appropriate email/monitoring configuration. A public demo remains
a test environment even if hosted on Vercel's Production deployment channel.

- Confirm the production database endpoint matches `PRODUCTION_NEON_ENDPOINT_ID` in both GitHub
  and Vercel. Keep preview database access isolated or absent.
- Use Clerk production keys for production admin access, and development keys
  for tests. Each admin must sign in against the selected instance; `ADMIN_USER_IDS` contains
  that instance's user IDs. Verify an allowlisted user can access admin and another user cannot.
- Use a dedicated production R2 bucket and custom domain. A bucket shared across independent
  environments lets one database's orphan reaper delete another environment's images. Scope
  credentials to the bucket and allow the exact app origin in its upload CORS policy.
- Use a verified Resend sender, a support/reply address, and the intended `ADMIN_ORDER_EMAIL`
  recipient. A restricted test sender does not establish delivery to arbitrary recipients.
- Confirm `NEXT_PUBLIC_APP_URL` matches the deployed origin. Verify social previews and product
  image URLs from that origin after deployment.
- Serve production only from `fuckersskateboards.com`. The production Clerk instance rejects
  every other origin, so the project's `www.fuckersskateboards.com` and `fuckers-hq.vercel.app`
  domains 308-redirect there (Vercel project Domains settings). Point Stripe webhooks and any
  other integration at that origin, never at an alias: providers do not follow redirects.
- Redeploy after environment changes. Static pages capture values such as `SUPPORT_EMAIL` and
  delivery configuration at build time.

## Payment and notification verification

Register the deployed `/api/webhooks/stripe` endpoint in the correct Stripe mode with its own
signing secret. A local Stripe CLI listener secret is not the deployed endpoint secret. The
endpoint must be reachable without a deployment-protection login.

Subscribe to:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`, `charge.dispute.updated`, `charge.dispute.closed`
- `charge.dispute.funds_withdrawn`, `charge.dispute.funds_reinstated`

Verify sandbox payment and replay behavior through [TESTING.md](TESTING.md#manual-release-checks).
Check shipping rates in admin, allowed countries, free-shipping threshold, and delivery-area
configuration against the published policies. Local delivery requires address review; an
out-of-area order may need supplemental shipping payment or a refund.

Keep `STRIPE_TAX_ENABLED` aligned with the business's approved tax setup. The
[small-supplier dashboard wizard](scripts/configure-stripe-small-supplier.sh) guides the account
checks and successful-payment receipt setting; it does not determine registration obligations.

Verify Stripe's customer email settings explicitly. After the branded confirmations and refund
notices have passed delivery checks, disable the corresponding Stripe emails so customers receive
one notice. Sandbox card payments do not prove the live account's automatic receipt settings.

For email changes, verify customer and admin recipients separately, inspect the durable delivery
state, and confirm a replay does not resend successful mail. Failed delivery must leave the paid
order committed. Customer-facing retries are available in the protected order page; admin sale
alerts use the durable retry job and diagnostic records.

## Scheduled jobs and monitoring

[vercel.json](vercel.json) is the source for schedules. Verify all three deployed jobs:

- `/api/cron/order-confirmations`
- `/api/cron/inventory-reservations`
- `/api/cron/orphaned-images`

Each requires the configured `CRON_SECRET` bearer token. Verify unauthorized requests return `401`
and authorized scheduled runs succeed. Vercel cron serves the Production deployment channel;
preview/local tests need explicit invocation against their isolated environment.

Check production Sentry reporting and source-map upload after deployment. Use a controlled error
without customer data; inspect readable stack traces and confirm payloads, addresses, payment
information, and secrets are absent. Preview/local builds and automated tests deliberately suppress
production reporting.

Confirm the upload from the deploy log's Sentry report, not from public `.map` URLs. The project's
Protected Sourcemaps setting (Deployment Protection) answers every `*.js.map` and `*.css.map`
request from outside a Vercel session with `403`, including paths that never existed, so the status
proves the maps are not public but not whether the build deleted them.

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
Use [TESTING.md](TESTING.md) for release checks and record actual results outside this runbook.

## Account ownership and handoff

The recorded launch agreement is below. Confirm whether a transfer has already happened before
acting, and record its completion date and verification in the handoff issue.

| Service | Launch owner | Agreed handoff |
| --- | --- | --- |
| Domain registration | Tristan | Developer retains collaborator access only. |
| Stripe | Tristan | Developer may be a team member. |
| Clerk | Tristan | Developer is a collaborator. |
| Vercel | Developer | Transfer to the brand within roughly two months of launch. |
| Cloudflare DNS and R2 | Developer | Transfer resources to the brand within roughly two months; retain developer collaborator access. |
| Resend | Developer | Add Tristan as an Admin of the existing team, rotate the production key, then remove the developer after delivery verification. |
| Sentry | Developer | No transfer planned. |

Neon's ownership arrangement was already settled separately and is unchanged by this agreement.

Transfer one provider at a time. Preserve DNS records, the R2 bucket and custom domain, Clerk
sign-in, and the verified email sender. Coordinate credential rotation with the owner, redeploy,
and verify the affected path before revoking old access or proceeding to the next provider.

For Resend, preserve the existing team and verified domain. Confirm Tristan can manage billing,
domains, and keys; replace the application's key with one scoped to the sending domain, verify
delivery, then revoke the old key and remove developer access. If a different team is required,
resolve domain ownership and DNS verification before switching the application. This app has no
Resend webhook secret to rotate.

For the first actual shipped order after launch, record the final carrier-label charge and packed
weight, then verify the saved comparison after fulfillment. This is an operator check on a real
shipment, not a reason to create or modify a production order for testing.
