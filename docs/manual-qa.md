# Manual QA Checklist

Use this checklist for a release candidate after the automated suite passes. Run payment tests only
in a Stripe sandbox and use a development or disposable Neon branch. Never paste secrets into QA
notes, screenshots, issues, or commits.

This document is also the source spec for the automated e2e suite (issue #6): each section maps to
automated coverage using browser, webhook, database, cron, or storage checks as applicable. The
checks that cannot be automated — dashboard reviews, WAF mode changes, and the fault-injection
cases that need a local breakpoint — stay manual.

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
  stripe listen \
    --events checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,checkout.session.expired \
    --forward-to localhost:3000/api/webhooks/stripe
  ```

- [ ] The listener's signing secret matches `STRIPE_WEBHOOK_SECRET` in `.env.local`.
- [ ] The configured Clerk user is present in `ADMIN_USER_IDS`.
- [ ] To QA local delivery, `DELIVERY_ENABLED=true` and `DELIVERY_AREA_NAME` are set; the
      fulfillment picker and delivery checkout are hidden otherwise.

The failure-boundary checks below require a local-only breakpoint or temporary reviewed throw.
Never commit fault-injection code. Use a fresh reservation for each case, target database changes by
the exact recorded reservation ID, and never edit `inventory_qty` or `reserved_qty` directly to
manufacture an outcome. Let Stripe events or authenticated reconciliation perform every stock
transition.

## 3. Storefront And Catalog

- [ ] The home page and `/products` render without console or hydration errors.
- [ ] Desktop Shop navigation opens on pointer hover and keyboard focus, and every category link
      reaches the matching catalog.
- [ ] Tablet and phone navigation opens and closes, expands Shop, closes after navigation, and
      returns focus to its trigger when dismissed with Escape.
- [ ] Crew and Videos are reachable from desktop and mobile navigation.
- [ ] The Videos page loads its Vimeo embed at phone, tablet, and desktop widths without
      horizontal overflow or distortion, and fullscreen playback is available.
- [ ] Product images load and remain centered at mobile and desktop widths.
- [ ] Search and sort refresh the catalog, update the URL, and reset pagination to page one.
- [ ] The Filters panel lists only subcategories the catalog has active products in, and keeps an
      already-applied subcategory listed so it can still be unchecked.
- [ ] Manual only: deactivate every product in one category, open that category's scoped view, and
      confirm the Filters panel shows `No filters available for this category.` rather than an
      empty subcategory group. The e2e suite cannot assert this, because specs must not assume the
      catalog holds only seed data; `tests/catalog-filter-popover.test.tsx` covers the branch.
- [ ] Shop navigation category links are limited to Hardgoods, Softgoods, and Accessories.
- [ ] Legacy `decks` and `apparel` category URLs redirect to their canonical replacements while
      retaining search, sort, and page state.
- [ ] Browser Back and Forward restore catalog state.
- [ ] A product page keeps price and quantity in one card, places Add to cart on a full-width row,
      hides ordinary inventory counts, shows `Only N left` for a selected variant with three or
      fewer available units, visually mutes out-of-stock variants without disabling their selector,
      and retains the out-of-stock warning after one is selected.
- [ ] Intentional line breaks entered in a product description remain visible on its product page,
      while long lines still wrap within the available width.
- [ ] An unknown product slug returns the custom not-found page.

## 4. Cart

- [ ] The header cart button opens a right-side cart without changing the current URL.
- [ ] Adding a variant updates the header count and subtotal and automatically opens the cart.
- [ ] Adding the same variant again merges its quantity instead of creating another line.
- [ ] Keyboard focus moves into the open cart, remains trapped there, and returns to the invoking
      header or Add to cart button after closing.
- [ ] Escape, the close button, the overlay, and Continue shopping close the cart without
      navigating, and the page behind it does not scroll while open.
- [ ] Quantity controls have product-specific accessible names, update totals, and respect limits.
- [ ] Removing a line and clearing the cart update the header count and show the empty state.
- [ ] A long cart scrolls its item list while keeping the summary and actions reachable.
- [ ] View cart closes the sidebar and navigates to the full `/cart` page.
- [ ] At phone widths the cart occupies the viewport width; at tablet and desktop widths it is
      capped and leaves the overlay visible.
- [ ] With delivery configured, the fulfillment picker offers Ship it and Local delivery in both
      the cart sidebar and `/cart` for merchandise subtotals of at least $30.
- [ ] Selecting Local delivery expands the Address review required warning inside the choice on
      both cart surfaces. It names the configured area, explains the shipping-payment or refund
      fallback, and includes the required acknowledgement checkbox.
- [ ] Checkout stays disabled until the acknowledgement is checked. Switching to shipping removes
      the requirement. Returning to delivery requires the checkbox again after a reload.
- [ ] A cart below $30 shows how much more is needed and does not allow Local delivery to be
      selected. Raising the subtotal to $30 or more enables it.
- [ ] The fulfillment choice persists with the cart across reloads, but the acknowledgement does
      not persist.
- [ ] With delivery unconfigured, the picker does not render and checkout uses shipping.
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
- [ ] A local-delivery checkout shows free delivery naming the configured area instead of shipping
      rates, and still collects the customer's address.
- [ ] Requesting the delivery method while delivery is not configured is rejected server-side.
- [ ] Sending a local-delivery request without the address-review acknowledgement is rejected
      before inventory is reserved or Stripe is called.
- [ ] Sending a local-delivery request whose current database-priced merchandise subtotal is below
      $30 is rejected before inventory is reserved or Stripe is called.
- [ ] With `STRIPE_TAX_ENABLED=false`, Checkout shows no tax for merchandise or shipping.
- [ ] Manual only: in a Stripe sandbox with a Canadian test registration, set
      `STRIPE_TAX_ENABLED=true` and complete a taxable order with standard shipping. Confirm
      Checkout calculates tax on both merchandise and shipping, then restore the setting. The
      deterministic e2e suite cannot control the Stripe account's test-registration state.
- [ ] Starting Checkout increases the selected variant's reserved quantity and reduces its
      available quantity without changing on-hand inventory.
- [ ] Submit the same sandbox Checkout request twice with the same request UUID and identical cart
      lines.
- [ ] Both submissions converge on the same Stripe Session/Checkout URL, with one pending checkout,
      one reservation, and one reserved-quantity increment.
- [ ] Reordering the same cart lines with that request UUID still converges, while changing a
      quantity with the reused UUID returns a safe conflict without changing stock.
- [ ] Cancelling the browser tab leaves the reservation active until Stripe expires the Session.
- [ ] After the Stripe expiration event or authenticated reconciliation run, reserved inventory
      returns to zero while on-hand inventory remains unchanged.

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
- [ ] The order's `destination_province` matches the Canadian province collected by Stripe. A
      local-delivery order converted to shipping uses the supplemental Checkout address.
- [ ] On-hand and reserved inventory both decreased by exactly the purchased quantity, leaving the
      correct available quantity.
- [ ] The confirmation email arrives once and contains the same persisted snapshots and totals.
- [ ] The sole configured order administrator receives one **New paid order** email. It states
      local delivery or paid shipping, lists the immutable product and variant snapshots with
      quantities and line totals, shows the paid total and currency, and links to the protected
      admin order.
- [ ] The admin sale email contains no customer email or shipping address. Opening its order link
      without an allowlisted Clerk session is rejected.
- [ ] Replay the paid Checkout event. The order still has one admin sale delivery and the provider
      receives no duplicate because the retry reuses `admin-new-order/<order-id>`.
- [ ] Force the admin sale delivery to fail. The paid order, inventory allocation, customer
      confirmation, and admin delivery row remain committed; the retry cron can send that same row
      later. The failure does not move the order into **Needs action**.
- [ ] Manual only: run `./scripts/configure-stripe-small-supplier.sh` and confirm the live Stripe
      Dashboard has **Successful payments** turned off. A sandbox payment does not prove this
      setting because Stripe does not send its automatic customer emails in sandbox mode.
- [ ] The order detail groups customer-facing email statuses under **Supporting details**, retains
      their independent retry actions, and does not show the admin sale notification.
- [ ] On desktop, the order detail uses separate fulfillment, summary, items, and supporting-detail
      bands. On mobile, those bands collapse into one continuous divided sheet without losing
      labels, actions, or horizontally scrollable item data.

Fulfillment for a shipping order:

- [ ] Marking the order shipped changes its status to `fulfilled`, records the optional carrier
      and tracking number together (a half-filled pair is rejected), and delivers exactly one
      `shipped` email.
- [ ] Canada Post tracking accepts a 16-digit domestic PIN or checksum-valid 13-character S10
      number, rejects a typo beside the field, and never submits the invalid shipment.
- [ ] Reloading confirms the fulfilled status and no longer offers the shipped action; automated
      tests cover an idempotent repeated action.

Fulfillment for a local-delivery order (requires the delivery configuration from section 2):

- [ ] The paid order appears in the Orders page's **Needs action** filter with an **Address
      review** badge. It does not appear in `/admin/deliveries` yet.
- [ ] Selecting the row shows the amber address-review summary and **Review full order** link in
      the queue preview.
- [ ] The full order shows the customer's address, a Google Maps search link, and the two explicit
      decisions: **Approve local delivery** and **Request shipping payment**.
- [ ] Attempting the delivery-scheduling action directly is rejected until the address is
      approved.
- [ ] Confirm **Approve local delivery**. The Needs action count decreases and the order appears in
      `/admin/deliveries`, oldest first, alongside the configured delivery area.
- [ ] Scheduling the delivery moves the order to `delivery_scheduled` and delivers exactly one
      `delivery_scheduled` email.
- [ ] Marking it delivered moves the order to `fulfilled` without sending another email.
- [ ] Each step offers only the single valid next transition; a shipping order is never offered
      delivery steps and vice versa.

Repeat with a fresh paid local-delivery order whose address is outside the free area:

- [ ] Confirm **Request shipping payment**. The two-click confirmation clearly says it will email
      the customer before creating anything.
- [ ] The order changes to **Awaiting shipping payment** without entering either fulfillment
      queue. The panel shows the persisted regular shipping rate, “plus applicable tax” before
      payment, the link expiry, and the payment-request email state.
- [ ] The shipping-payment email arrives once, explains why shipping is required, links to Stripe,
      offers cancellation for a refund, and names the base shipping charge without claiming a
      final tax amount.
- [ ] **Open payment link** and **Copy link** expose the same current Stripe Checkout URL. Stripe
      collects the allowed shipping address and shows exactly one shipping line with no promotion
      code field.
- [ ] Cancel Stripe Checkout. `/order/shipping-payment/cancelled` says the original order is
      unchanged and the emailed link remains usable until expiry.
- [ ] Reopen the emailed link and pay with the successful sandbox card. Stripe redirects to the
      dedicated shipping-payment success page, not the original order success page.
- [ ] Exactly one existing order is updated; no second order or inventory change is created. Its
      method becomes shipping, it enters **To ship**, and its review badge reads **Shipping paid**.
- [ ] The original checkout subtotal, delivery charge, tax, total, and original address remain
      unchanged. The supplemental shipping base, Stripe tax, total, payment references, refund
      state, and collected shipping address appear separately.
- [ ] Replaying the supplemental `checkout.session.completed` event does not change the order,
      payment record, outbox, or inventory a second time.
- [ ] Marking the converted order shipped uses the address collected by the supplemental Checkout
      and sends one normal shipping email.

Shipping-payment recovery and cancellation:

- [ ] Let a fresh payment link expire. The expiration webhook returns the order to **Address
      review**; the expired link cannot be reused.
- [ ] Request shipping again. A new generation and email idempotency key are created while the
      expired request remains in order history.
- [ ] Temporarily fault the Stripe Session call after the request commits, retry from the full
      order, and confirm the same persisted idempotency key converges on one Checkout Session.
- [ ] Partially refund the supplemental shipping payment in Stripe. The original order and
      inventory financials stay unchanged, the order becomes **Shipping payment issue**, and
      shipping is blocked until an operator reconciles the extra payment in Stripe.
- [ ] For a customer who declines shipping, refund the original order in Stripe. Confirm the usual
      refund/inventory workflow applies; do not manually rewrite the original order total.
- [ ] The automated Postgres suite covers the impractical late-event case: payment on an older
      generation after a replacement link exists is retained as a blocking exception rather than
      discarded or applied silently.

Refund inventory:

- [ ] Fully refund an unfulfilled paid order in Stripe. The order changes to `refunded`, its
      inventory state changes to `released`, and every purchased unit returns to on-hand stock.
- [ ] Replay the same signed refund event. Neither inventory nor the order changes a second time.
- [ ] Partially refund another paid order. Stock stays allocated, the order enters the admin
      Needs action filter and dashboard attention list, the red Orders navigation counter
      increases, and its detail page shows the red Stock action required banner.
- [ ] Fully refund a shipped or delivered order. Stock stays allocated and the same operator alert
      appears instead of restocking automatically.
- [ ] For sellable returned goods, use Return all units to stock and confirm the banner clears,
      the Orders navigation counter decreases, the inventory badge reads Returned to stock, and
      each order quantity is added exactly once. While the page refreshes, the action stays disabled
      as Returning… instead of briefly offering the same stock return again.
- [ ] For damaged, lost, or customer-kept goods, leave the action untouched. The warning remains
      visible rather than quietly making unavailable units sellable.

Refund email:

- [ ] In Stripe sandbox, partially refund an original order payment. Confirm one branded email says
      **We issued a partial refund** and shows the amount refunded this time, cumulative refunded
      amount, remaining paid amount, order number, and currency-formatted values.
- [ ] Apply a second partial refund to that payment. Confirm a second email uses only the new delta
      for **Refunded this time** while preserving the new cumulative and remaining-paid amounts.
- [ ] Refund the remaining balance. Confirm a third email says **Your order is fully refunded**,
      shows the final delta, cumulative order total, and zero remaining paid.
- [ ] Replay each signed refund event and deliver a newer event with a lower cumulative amount.
      Confirm no additional refund delivery rows or customer emails appear.
- [ ] Inspect each refund email section on the full admin order. Force one Resend failure, confirm
      the refund and inventory changes remain committed, then retry that specific email and confirm
      it reuses the same provider idempotency key.
- [ ] Refund an original payment before its paid Checkout event is processed. Process the paid event
      and confirm the order queues both its confirmation and one refund email using the retained
      cumulative amount.
- [ ] Refund a supplemental shipping payment. Confirm it creates the existing shipping-payment
      exception but never queues an original-order refund email.
- [ ] Keep Stripe's refund emails enabled until this flow is deployed and the sandbox checks above
      pass. Then disable Stripe refund emails in the Dashboard so customers receive one notice.

Use a fresh sandbox order to verify catalog mutation after Checkout creation:

- [ ] Open hosted Checkout and record the displayed product name, variant name, unit price, and
      quantity.
- [ ] Before paying, change those catalog names and the price in admin without changing the
      reservation's inventory.
- [ ] Complete payment and confirm the order and confirmation delivery retain the values originally
      displayed by Checkout, not the newer catalog values.
- [ ] Confirm stock conversion still uses the reserved variant and quantity, then restore the
      catalog values.

Use another fresh sandbox order to verify recovery when the paid webhook is delayed:

- [ ] Open Checkout, stop local Stripe forwarding, and complete a successful sandbox payment.
- [ ] Confirm no local order is created merely from the browser redirect and the reservation
      remains active.
- [ ] On the disposable database branch, set only that reservation's `next_reconcile_at` to now,
      then invoke the authenticated inventory-reservation cron.
- [ ] Reconciliation retrieves the paid Session, creates exactly one order and confirmation
      delivery, and converts on-hand and reserved inventory exactly once.
- [ ] Restart forwarding and resend the original paid event; it succeeds without another order,
      stock decrement, or confirmation email.

## 7. Webhook Replay And Idempotency

### Concurrent inventory and admin guards

Before replaying an event, verify competing reservations against the disposable database branch:

- [ ] Set a test variant's inventory to one and open two hosted Checkout Sessions for that unit
      as concurrently as practical.
- [ ] Exactly one request receives a payable Checkout URL; the competing request receives an
      availability error.
- [ ] Admin shows one on-hand, one reserved, and zero available before payment.
- [ ] Completing the payable Session creates one allocated paid order and leaves on-hand, reserved,
      and available inventory at zero.
- [ ] Expiring the payable Session instead releases the reservation exactly once and restores one
      available without changing on-hand inventory.
- [ ] Lowering on-hand inventory below the reserved quantity and deleting the reserved variant are
      both rejected by admin.

Also retain one malformed-reservation sandbox fixture or integration test that confirms a verified
paid Session is persisted as an inventory exception rather than discarded.

### Checkout creation and provisioning recovery

Use a fresh variant or allow the prior Session to reach a terminal state before each case:

- [ ] Temporarily configure an intentionally invalid Stripe **sandbox** secret, restart the local
      app, and attempt Checkout.
- [ ] The confirmed Stripe authentication rejection returns a safe error, marks the reservation
      released with a creation-failure reason, restores reserved inventory to zero, and leaves
      on-hand inventory unchanged.
- [ ] Restore the valid sandbox secret before continuing.
- [ ] Add a local-only fault immediately after the reservation transaction commits but before the
      exact Stripe Session request is persisted, then attempt Checkout.
- [ ] Remove the fault, make only that reservation due, and run authenticated reconciliation.
- [ ] The abandoned pre-request reservation releases exactly once without contacting Stripe or
      changing on-hand inventory.
- [ ] Add a local-only fault after Stripe returns a Session but immediately before
      `linkStripeSession`, then attempt Checkout once.
- [ ] Remove the fault, make only that provisioning reservation due, and run authenticated
      reconciliation.
- [ ] Reconciliation reuses the persisted Session request and idempotency key, links the original
      Stripe Session, creates no second Session, and increments reserved inventory only once.
- [ ] Complete or expire that linked Session and confirm the resulting conversion or release is
      exactly once.

### Asynchronous payment lifecycle

Temporarily enable a sandbox delayed-notification payment method compatible with the configured
currency and country. Follow Stripe's
[delayed-payment fulfillment guidance](https://docs.stripe.com/checkout/fulfillment) and that
method's sandbox testing instructions.

- [ ] Complete Checkout with the delayed method and confirm
      `checkout.session.completed` reports `payment_status = unpaid`.
- [ ] The reservation moves to `awaiting_payment`; no paid order or confirmation delivery exists,
      on-hand inventory is unchanged, and reserved inventory remains held.
- [ ] Cause the sandbox payment to succeed.
- [ ] `checkout.session.async_payment_succeeded` creates exactly one paid order and confirmation
      delivery, then decrements on-hand and reserved inventory exactly once.
- [ ] Repeat with a fresh reservation and cause the sandbox payment to fail.
- [ ] `checkout.session.async_payment_failed` creates no paid order, releases reserved inventory
      exactly once, and leaves on-hand inventory unchanged.
- [ ] Replay the unpaid completion and terminal async event for both cases; every replay succeeds
      without changing the terminal reservation, order count, stock, or delivery count.

### Reconciliation safety and overlapping invocations

- [ ] Open a payable Stripe Session that has not expired or completed.
- [ ] On the disposable database branch, set only that reservation's `next_reconcile_at` to now and
      invoke the authenticated reconciliation cron.
- [ ] Stripe still reports the Session as open, so reconciliation keeps stock reserved and defers
      the next attempt instead of releasing from the local clock.
- [ ] Make one safe test reservation due and invoke two authenticated reconciliation requests as
      concurrently as practical.
- [ ] The lease permits only one effective transition; both requests return safely and the
      reservation, inventory counters, order count, and Stripe Session count remain consistent.
- [ ] Allow every Session created by this section to convert or expire before cleanup. Do not
      delete non-terminal reservation rows or zero reservation counters manually.

### Stripe webhook replay

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
- [ ] The new-product action dock is absent before the first edit; typing in the form or staging
      only an image reveals it. Phones immediately pin one compact row with Save draft and Publish
      inside the page gutters and above the bottom edge, while larger screens retain the full
      controls. Proton Pass does not alter the composer or cause a hydration error. Real-browser
      phone testing still reproduces the dock-positioning failure tracked in #183.
- [ ] Choosing Accessories offers Magnets as a product subcategory.
- [ ] Editing its name, slug, category, description, and status updates the storefront after
      revalidation.
- [ ] A variant can be created and its price and inventory can be updated.
- [ ] Product cards name a single low-stock variant and show a compact count when multiple
      variants are low or out of stock.
- [ ] Duplicate product slugs and variant SKUs produce safe form errors.
- [ ] Archiving a product removes it from the public catalog without deleting historical orders.
- [ ] Invalid order and product IDs do not expose internal data.
- [ ] Only an allowlisted administrator can invoke the confirmation-email retry action.
- [ ] Retrying a failed sandbox delivery increments its attempt count; a successful retry changes
      the delivery to `Sent`, while another retry does not send a duplicate.
- [ ] An order persisted as an inventory exception shows the resolve action; a successful retry
      allocates stock exactly once, and a repeat resolve attempt is rejected without changing
      inventory.

## 9. Order Email Delivery Recovery

Confirmation, shipping-payment request, `delivery_scheduled`, and `shipped` emails all flow through
the same durable outbox; a delivery failure never rolls back the paid order, payment link, or the
fulfillment transition that queued it.
Non-terminal failures defer the email to the retry cron; after the attempt limit the delivery
becomes `Needs attention`, which the cron no longer picks up and only the admin retry action can
deliver. Perform this check only with a test recipient and sandbox
order. Do not use production customer data or live Resend credentials.

- [ ] Temporarily use an invalid test Resend credential and create a paid Stripe sandbox order.
- [ ] The paid order and its items remain persisted while the delivery becomes `Retry scheduled`.
- [ ] Restore the valid test credential and invoke the authenticated cron route or use the admin
      retry button.
- [ ] The same delivery reaches `Sent` with a higher attempt count and only one email arrives.
- [ ] A request to the cron route without `Authorization: Bearer <CRON_SECRET>` returns `401`.
- [ ] The inventory-reservation cron also rejects a request without the same bearer secret.

## 10. Product Images

- [ ] New and existing product pages use the same native image picker; choosing a valid file on an
      existing product starts the upload immediately, then the new image card exposes its alt text.
- [ ] On an existing product, the image picker matches adjacent image-card heights at tablet and
      desktop widths and stacks below them on a phone.
- [ ] JPEG, PNG, WebP, or AVIF uploads complete directly from the browser to R2.
- [ ] Unsupported and oversized files are rejected before product-image persistence.
- [ ] The preview, admin image card, catalog card, and product gallery display the uploaded image.
- [ ] Alt text and position changes persist and storefront ordering is correct.
- [ ] Deleting an image removes its database record and attempts R2 cleanup.
- [ ] A request to the orphaned-image cron route without `Authorization: Bearer <CRON_SECRET>`
      returns `401`.
- [ ] Against a dedicated non-production R2 bucket containing only test objects, the authenticated
      orphaned-image reaper deletes only objects no product image references and reports what it
      removed; referenced images remain served. Never run this check against a production bucket.

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
