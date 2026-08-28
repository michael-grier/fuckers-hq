---
name: e2e-check
description: Run the Playwright e2e suite to verify storefront, admin, or commerce behavior in a real browser. Use after changing checkout, webhooks, orders, inventory, cart, catalog, or admin flows — or whenever a change should be proven against the running app rather than unit tests alone.
---

# E2E Check

The suite lives in `e2e/` and runs against a dev server on :3000 (reused if already running,
booted otherwise) and this worktree's own database. Global setup refuses to run against anything
that is not test-scoped (sandbox Stripe key, dev Clerk key, loopback URL, and the
`E2E_DATABASE_URL === DATABASE_URL` opt-in that `setup:worktree` writes), then reseeds the
catalog, so runs are repeatable.

## Choosing a tier

```bash
bun run test:e2e                         # everything deterministic (~2 min)
bun run test:e2e -- --grep @smoke        # storefront + cart only, quickest signal
bun run test:e2e -- --project=admin      # Clerk-authenticated admin surface
bun run test:e2e -- --project=commerce   # checkout + synthetic signed Stripe webhooks
bun run test:e2e:live                    # OPT-IN: real hosted-Checkout payment + R2 upload
```

Match the tier to the change: catalog/cart/UI → `@smoke`; admin or authz → `admin`;
anything touching checkout, webhooks, orders, inventory, or emails → `commerce`. The live tier
talks to external services (Stripe CLI relay, real card entry, real R2 uploads) — run it only when
the user asks for live verification, and never in CI.

Prerequisites the suite will tell you about if missing: `bun x playwright install chromium`
(once per machine), `E2E_CLERK_USER_EMAIL` + the e2e admin in `ADMIN_USER_IDS` (admin/commerce
tiers), `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` (commerce tier).

## Reading failures

Failures write traces, screenshots, and an error-context snapshot per spec into gitignored
`.e2e-artifacts/output/<spec-dir>/`:

- `error-context.md` — the failed assertion plus an accessibility snapshot of the page at
  failure time. Read this first; it usually answers "what was actually on screen".
- `trace.zip` — full timeline when the context file is not enough
  (`bun x playwright show-trace <path>`).
- `.e2e-artifacts/results.json` — machine-readable results for the whole run.

The suite runs with `retries: 0` on purpose: a spec that fails intermittently is a bug to fix
(usually a hydration race — retry the action+outcome pair with `expect(...).toPass` — or a
missing wait on a condition), never something to retry or sleep around. Two Biome rules enforce
the worst habits (`e2e/lint/*.grit`).

## After the run

Report which tier ran and the result. Delete `.e2e-artifacts/` once failures are diagnosed.
Specs must stay self-contained: unique per-run names/emails, release any reservation they create,
and never assume the catalog holds only seed data.
