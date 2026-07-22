# Manual QA Checklist

Use this checklist for a release candidate after the automated suite passes. Run payment tests only
in a Stripe sandbox and use a development or disposable Neon branch. Never paste secrets into QA
notes, screenshots, issues, or commits.

## QA Record

- Date:
- Tester:
- Commit SHA:
- App URL:
- Database branch:
- Stripe mode: sandbox
- Browser and viewport:

## 1. Automated Release Gate

- [ ] `git status --short --branch` shows only the intended release changes.
- [ ] `bun run lint` passes.
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run build` passes.
- [ ] Sentry source-map upload completes when its deployment credentials are configured.

The automated suite does not mutate the configured Neon database. Sections 6 and 7 therefore
verify the real transaction, unique constraint, conditional inventory update, and webhook replay
against a development or disposable database branch.

## 2. Local Services And Test Data

- [ ] The development database is migrated and contains at least one active, in-stock product.
- [ ] Record the selected variant ID, current price, and starting inventory outside the repository.
- [ ] Start the app with `bun run dev`.
- [ ] Start Stripe forwarding with:

  ```bash
  stripe listen --events checkout.session.completed,checkout.session.async_payment_succeeded \
    --forward-to localhost:3000/api/webhooks/stripe
  ```

- [ ] The listener's signing secret matches `STRIPE_WEBHOOK_SECRET` in `.env.local`.
- [ ] The configured Clerk user is present in `ADMIN_USER_IDS`.

## 3. Storefront And Catalog

- [ ] The home page and `/products` render without console or hydration errors.
- [ ] Product images load and remain centered at mobile and desktop widths.
- [ ] Search, category filters, sort, and pagination update the URL.
- [ ] Browser Back and Forward restore catalog state.
- [ ] A product page shows the correct variants, prices, and availability.
- [ ] An unknown product slug returns the custom not-found page.

## 4. Cart

- [ ] Adding a variant updates the header count and cart subtotal.
- [ ] Adding the same variant again merges its quantity instead of creating another line.
- [ ] Quantity controls update totals and respect their limits.
- [ ] Removing a line and clearing the cart update the header count.
- [ ] Reloading the page preserves the cart.
- [ ] Cancelling hosted Checkout returns to `/cart` without clearing purchase intent.
- [ ] Completing a paid Checkout clears the cart on the success page.

## 5. Server-Authoritative Checkout

- [ ] Add a product to the cart, change its price in admin, and start Checkout.
- [ ] Stripe displays the current database price rather than the stale cart snapshot.
- [ ] Add a product to the cart, reduce its inventory below the cart quantity, and start Checkout.
- [ ] The app shows an availability error and leaves the cart editable.
- [ ] A standard-rate order shows the configured fixed shipping amount.
- [ ] An order at the free-shipping threshold shows free shipping.
- [ ] Only configured shipping countries are selectable.
- [ ] Tax behavior matches `STRIPE_TAX_ENABLED` and the Stripe sandbox configuration.

Restore the product price and inventory after these checks.

## 6. Paid Order End To End

- [ ] Record the chosen variant's inventory immediately before payment.
- [ ] Complete hosted Checkout with Stripe's
      [successful sandbox card](https://docs.stripe.com/testing) `4242 4242 4242 4242`, any future
      expiry, any three-digit CVC, and a valid postal code.
- [ ] Stripe redirects to `/order/success` and the page confirms payment without exposing order or
      customer details in the URL.
- [ ] The CLI reports a successful webhook response.
- [ ] Exactly one order appears in admin with status `paid`.
- [ ] Order totals, shipping address, product name, variant name, quantity, and unit-price snapshots
      match Checkout.
- [ ] Inventory decreased by exactly the purchased quantity.
- [ ] The confirmation email arrives once and contains the same persisted snapshots and totals.
- [ ] The order detail shows the confirmation delivery as `Sent` with one attempt.
- [ ] Marking the order shipped changes its status to `fulfilled`.
- [ ] Reloading confirms the fulfilled status and no longer offers the shipped action; automated
      tests cover an idempotent repeated action.

## 7. Webhook Replay And Idempotency

Before replaying an event, verify the competing-checkout exception path against the disposable
database branch:

- [ ] Set a test variant's inventory to one and open two hosted Checkout Sessions for that unit
      before paying either Session.
- [ ] Complete both payments with Stripe sandbox cards; both webhook deliveries succeed and both
      paid orders appear in admin.
- [ ] Exactly one order shows allocated inventory, the other shows an inventory exception, and
      inventory is zero rather than negative.
- [ ] The exception order cannot be marked shipped.
- [ ] Restock one unit, retry allocation from the exception order, and confirm inventory returns to
      zero while the exception changes to allocated.
- [ ] Retrying allocation again does not decrement inventory a second time.

Use a Stripe-registered sandbox endpoint, such as a preview deployment. Follow Stripe's
[webhook retry guidance](https://docs.stripe.com/webhooks), find the original event and endpoint IDs
in Stripe Workbench, then either click **Resend** on the event or run:

```bash
stripe events resend <event_id> --webhook-endpoint=<endpoint_id>
```

- [ ] The replay receives a successful response.
- [ ] The Stripe Session still maps to exactly one order.
- [ ] Inventory does not decrease again.
- [ ] No duplicate order items are created.
- [ ] A previously successful confirmation remains `Sent` and no second email is delivered.
- [ ] A confirmation in `Retry scheduled` or `Needs attention` is retried by the verified replay
      without creating another order.
- [ ] No new unexpected Sentry issue appears.

The unique `orders.stripe_session_id` constraint is the database backstop. If verification is
needed, use the Neon SQL editor with the sandbox Session ID:

```sql
select count(*)
from orders
where stripe_session_id = '<sandbox_session_id>';
```

The expected count is `1`. Do not commit identifiers copied from a real customer order.

## 8. Admin Authorization And Catalog Writes

- [ ] A signed-out browser cannot access `/admin`.
- [ ] A signed-in Clerk user absent from `ADMIN_USER_IDS` receives no admin data.
- [ ] An allowlisted administrator can create a draft product.
- [ ] Editing its name, slug, category, description, and status updates the storefront after
      revalidation.
- [ ] A variant can be created and its price and inventory can be updated.
- [ ] Duplicate product slugs and variant SKUs produce safe form errors.
- [ ] Archiving a product removes it from the public catalog without deleting historical orders.
- [ ] Invalid order and product IDs do not expose internal data.
- [ ] Only an allowlisted administrator can invoke the confirmation-email retry action.
- [ ] Retrying a failed sandbox delivery increments its attempt count; a successful retry changes
      the delivery to `Sent`, while another retry does not send a duplicate.

## 9. Confirmation Delivery Recovery

Perform this check only with a test recipient and sandbox order. Do not use production customer
data or live Resend credentials.

- [ ] Apply the outbox migration to a disposable database branch before running the new app code.
- [ ] Temporarily use an invalid test Resend credential and create a paid Stripe sandbox order.
- [ ] The paid order and its items remain persisted while the delivery becomes `Retry scheduled`.
- [ ] Restore the valid test credential and invoke the authenticated cron route or use the admin
      retry button.
- [ ] The same delivery reaches `Sent` with a higher attempt count and only one email arrives.
- [ ] A request to the cron route without `Authorization: Bearer <CRON_SECRET>` returns `401`.

## 10. Product Images

- [ ] JPEG, PNG, WebP, or AVIF uploads complete directly from the browser to R2.
- [ ] Unsupported and oversized files are rejected before product-image persistence.
- [ ] The preview, admin image card, catalog card, and product gallery display the uploaded image.
- [ ] Alt text and position changes persist and storefront ordering is correct.
- [ ] Deleting an image removes its database record and attempts R2 cleanup.

## 11. Security And Observability

- [ ] Storefront responses include CSP, `X-Content-Type-Options`, `X-Frame-Options`,
      `Referrer-Policy`, and `Permissions-Policy` headers.
- [ ] The browser console contains no CSP violations during sign-in, image upload, or Checkout.
- [ ] Invalid JSON produces a safe `400`; non-JSON API input produces `415`; oversized input
      produces `413`.
- [ ] Invalid Stripe signatures return `400` without creating a noisy Sentry issue.
- [ ] A controlled unexpected server error appears in Sentry without request bodies, customer
      details, payment data, or secrets.
- [ ] Production Vercel WAF checkout and upload rules are in log-only mode for final QA, then changed
      to rate-limit mode before accepting customers.

## 12. Cleanup And Sign-Off

- [ ] Restore any product, inventory, shipping, tax, and email configuration changed during QA.
- [ ] Remove or archive test products and orders according to the environment's cleanup policy.
- [ ] Stop the Stripe listener and local server when testing is complete.
- [ ] Review Stripe, Neon, Resend, R2, Clerk, Vercel, and Sentry dashboards for unexpected errors.
- [ ] Record passed checks and any accepted exceptions in the release notes.
- [ ] A second person reviews money-path or deployment exceptions before go-live.

Release decision: **PASS / FAIL**

Notes:
