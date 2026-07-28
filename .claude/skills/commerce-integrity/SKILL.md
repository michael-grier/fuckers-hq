---
name: commerce-integrity
description: Protect this store's payment, checkout, webhook, order, inventory, refund, fulfillment, and confirmation-email invariants. Use when implementing, fixing, or reviewing code that touches Stripe Checkout or webhooks, pending checkouts, paid-order persistence, inventory changes tied to purchases, order financial state, refunds or disputes, fulfillment eligibility, or post-payment email delivery.
---

# Commerce Integrity

Treat commerce changes as failure-sensitive distributed workflows. Preserve correct outcomes across retries, duplicate events, delayed payment, mutable catalog data, concurrent inventory changes, and downstream outages.

## Establish Context

1. Read the architecture summary and the relevant operational section in `README.md`.
2. Inspect the current implementation, schema, migration, validators, and tests before proposing changes. Treat code and migrations as the implemented truth when planning compatibility.
3. Trace the complete path across client input, checkout creation, Stripe, webhook verification, database transaction, email delivery, admin state, and observability. Do not review only the edited function.
4. Identify persisted-data changes early. Apply the global `drizzle-zod-contracts` workflow when available.

## Preserve The Boundaries

- Treat cart, metadata, request bodies, URLs, prices, totals, inventory, identity, and status values from the browser as untrusted.
- Resolve purchasable variants, prices, currency, and availability on the server before creating Checkout.
- Keep Stripe authoritative for charges, tax, refunds, disputes, and payment state. Make persisted totals and item snapshots reconcile with what Stripe charged.
- Verify the raw webhook body and Stripe signature before parsing trusted event data or causing side effects.
- Make every webhook transition idempotent and safe under duplicate, delayed, retried, and out-of-order events. Do not rely only on an in-memory check.
- Preserve immutable order history. Capture the line-item values used for Checkout before mutable catalog records can change.
- Never discard a verified paid event because fulfillment inventory is unavailable. Persist a traceable paid exception state or provide a deterministic compensating path.
- Keep order persistence and its required inventory transition atomic. Model reservations, releases, restocks, and refunds as explicit state transitions when the task introduces them.
- Prevent fulfillment when local payment state is refunded, disputed, or otherwise ineligible.
- Keep email and other downstream delivery after the order commit. Record retryable delivery state when reliable delivery is in scope; never roll back a paid order because email failed.
- Require server-side authorization independently of Clerk authentication for every admin read and write.
- Avoid customer data, payment details, secrets, and raw payloads in logs, errors, tests, and monitoring metadata.

If the requested change crosses a boundary with a known existing weakness, surface it explicitly. Fix it when required for the requested behavior; otherwise avoid expanding scope and record the residual risk.

## Design For Failure

Before editing, write down the expected result for the relevant cases:

- duplicate request or webhook;
- transient database or provider failure;
- catalog mutation between Checkout creation and payment;
- two buyers competing for the last unit;
- invalid signature or malformed input;
- partial and full refund, dispute, or out-of-order event when applicable;
- email failure after a successful database commit.

Use unique constraints, transactions, durable state, and stable idempotency keys as the enforcement mechanisms. Do not depend on timing, a single delivery attempt, or a preliminary read followed by an unguarded write.

## Keep External Operations Safe

- Use Stripe sandbox mode only. Do not create charges, refunds, products, webhooks, or other objects in live mode.
- Keep Neon MCP read-only by default. Request write access only for an explicit task, use an isolated development branch, and review the proposed SQL or action.
- Never apply migrations, seeds, destructive SQL, or test fixtures to production.
- Do not print or commit `.env.local`, connection strings, webhook secrets, API keys, tokens, customer addresses, or payment data.
- Stop and request direction before an external action would affect real customers, money, production data, or live infrastructure.

## Verify Proportionally

Run the narrowest affected tests first, then expand based on the changed boundary:

- Checkout or cart contract: `bun test tests/checkout.test.ts tests/contracts.test.ts tests/security.test.ts`
- Webhook, paid orders, or inventory: `bun test tests/webhook.test.ts tests/checkout.test.ts tests/admin-orders.test.ts`
- Email delivery: `bun test tests/email.test.ts tests/webhook.test.ts`
- Admin order or fulfillment state: `bun test tests/admin-orders.test.ts tests/auth.test.ts tests/security.test.ts`
- Schema, migration, or persistence contract: run affected tests plus `bun run db:generate` only when a schema change requires a reviewed migration. Never apply it to an unverified database.

Add regression coverage for the failure mode being changed. Prefer tests that prove persisted state and replay behavior over tests that only assert a provider method was called.

After focused checks pass, run:

```bash
bun test
bun run lint
bun run typecheck
bun run build
```

If credentials or external services prevent a check, state exactly what was not exercised and provide the sandbox-only manual verification step.

## Report The Result

Summarize:

1. The commerce invariant changed or protected.
2. The idempotency, transaction, authorization, and failure behavior.
3. Automated and sandbox checks performed.
4. Unverified external behavior, migration requirements, and residual risks.
