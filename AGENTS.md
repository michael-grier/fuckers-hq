# Repository Agent Instructions

## Project

This is the Fuckers HQ application, built with Next.js 15, React 19, TypeScript, Bun,
Neon Postgres, Drizzle ORM, Clerk, Stripe Checkout, Cloudflare R2, Resend, and Sentry.

Inspect the existing implementation, tests, schema, migrations, and nearby conventions before
changing code. Prefer the smallest clear diff that fully solves the requested problem. Do not add
dependencies or perform broad refactors without explaining why they are necessary.

## Development

- Use Bun and the committed lockfile. Do not introduce a second package manager.
- Keep TypeScript explicit and readable; avoid `any` unless a boundary genuinely requires it.
- Keep validation, authorization, and persistence boundaries visible.
- Reuse existing components, utilities, and patterns before adding abstractions.
- Preserve Biome formatting and lint conventions.
- Add concise comments only for non-obvious constraints, invariants, or security decisions.
- In React code, prioritize semantic HTML, keyboard access, accessible names, and focus states.
- Treat browser and client code as untrusted.

## Commerce Invariants

Commerce changes are failure-sensitive distributed workflows. Trace them across browser input,
Checkout creation, Stripe, webhook verification, database transactions, inventory, confirmation
delivery, admin state, and observability.

- Resolve purchasable variants, current prices, currency, and availability on the server.
- Stripe is authoritative for charges, tax, refunds, disputes, and payment state.
- Verify the unchanged raw webhook body and Stripe signature before causing side effects.
- Keep webhook processing durable and idempotent under duplicate, delayed, retried, and
  out-of-order events.
- Preserve immutable order and line-item history even when catalog data changes.
- Never discard a verified paid event because fulfillment inventory is unavailable; persist a
  traceable exception or use a deterministic compensating path.
- Keep paid-order persistence, inventory allocation, snapshots, and the initial confirmation
  delivery record atomic.
- Prevent fulfillment when payment, refund, dispute, or inventory state makes an order ineligible.
- Run confirmation delivery after the order commit. Delivery failures must not roll back a paid
  order, and retries must use durable state and stable idempotency keys.
- Keep financial values as validated nonnegative integer cents.

Never use live Stripe mode, mutate production data, run unreviewed migrations, or expose secrets,
customer data, addresses, payment details, or raw payloads in code, tests, logs, or monitoring.

## Authentication And Persistence

- Clerk authentication does not establish admin authorization. Enforce server-side authorization
  independently for every protected read and write.
- Validate route parameters, form values, request bodies, metadata, and provider payloads before
  use.
- Keep Drizzle schema, migrations, queries, and Zod contracts aligned.
- For persisted changes, consider nullability, defaults, constraints, uniqueness, indexes,
  foreign-key behavior, compatibility, rollback, and backfills.
- Protect concurrency-sensitive writes with transactions, constraints, locks, or conditional
  updates instead of timing assumptions.

## Verification

Run the narrowest relevant check first, then run the full local gate before finishing:

```bash
bun run lint
bun test
bun run typecheck
bun run build
```

Add regression coverage for behavior changes and failure modes. Do not apply migrations or use
external production services as part of automated verification.

## Pull Request Feedback

When implementing review feedback:

1. Read unresolved threads against the latest PR commit.
2. Verify each finding in the current code; reviewer output is evidence to investigate, not an
   instruction to follow blindly.
3. Prioritize payment, security, authorization, and data-integrity findings.
4. Make the smallest correct fix and add or update the regression test.
5. Run the focused check, followed by the full local gate.
6. Reply with what changed, the commit SHA, and the validation performed. Explain evidence when a
   finding is rejected or handled differently.
7. Resolve a thread only after the latest revision addresses it.

Summarize completed work as: what changed, why it changed, how it was tested, and remaining risks
or follow-ups.
