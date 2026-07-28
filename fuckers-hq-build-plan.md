# Fuckers HQ - Codex Build Plan

Source document: `fuckers-hq-architecture.md`

This plan turns the architecture into implementation handoffs for Codex agents. It is written so agents can work in sequence or in small parallel tracks without re-deciding the core architecture.

## Build Objective

Build the production-ready Fuckers HQ storefront using:

- Next.js 15 App Router
- Bun for local tooling and scripts
- Node runtime on Vercel Pro
- Neon Postgres
- Drizzle ORM
- drizzle-zod, Zod, React Hook Form
- Clerk for admin-only authentication
- Stripe hosted Checkout and Stripe Tax
- Cloudflare R2 for product image storage
- shadcn/ui and Tailwind
- Zustand plus localStorage for the cart
- nuqs for catalog URL state
- Resend and React Email
- Sentry
- Biome

The store uses guest checkout only. Customers do not have accounts. Catalog and orders live in Postgres. Stripe owns payment, tax, payment status, and customer checkout details. Postgres mirrors paid order data after the Stripe webhook succeeds.

## Non-Negotiable Architecture Rules

Every agent must preserve these constraints:

- The client cart expresses purchase intent only. It never decides price, tax, shipping, inventory, or order status.
- Prices are stored as integer cents in Postgres and re-read on the server when creating a Stripe Checkout Session.
- Stripe Checkout is hosted. Do not build a custom payment form.
- Stripe Tax is used through Checkout. The app does not calculate tax itself.
- No order row is created before payment. Orders are created only from the verified Stripe webhook.
- Checkout creates a short-lived `pending_checkouts` row and stores only its token in Stripe metadata.
- The webhook must verify the raw request body with Stripe's signature.
- `orders.stripeSessionId` must be unique and used as the webhook idempotency guard.
- Inventory decrement must happen inside the same transaction as order creation.
- Inventory decrement must be conditional, using `WHERE inventory_qty >= quantity`, to avoid overselling under races.
- Order item rows must store product, variant, unit price, and quantity snapshots.
- Email is sent after the database transaction commits. Email failure must not cause the webhook to fail after the order is persisted.
- Admin routes need Clerk middleware protection and a server-side authorization check.
- Runtime boundaries must use Zod parsing. TypeScript types alone are not enough.
- Drizzle schema is the source for database types and `drizzle-zod` schemas wherever practical.
- Product mutations must revalidate affected ISR catalog/product pages.
- Product image files upload directly from the browser to R2 using a presigned URL. Large files must not route through the Next.js server.
- V2 features are out of scope unless explicitly requested: customer accounts, wishlists, real category tables, discount management, advanced fulfillment, returns, multi-currency, and custom checkout UI.

## Coordination Model

Use one of these approaches:

1. Sequential single-agent build: run workstreams in order from 0 through 11.
2. Multi-agent build: assign independent agents after shared foundations are merged.

Recommended dependency order:

1. Agent 0: scaffold and repo foundations.
2. Agent 1: database, schema, migrations, validation.
3. Agent 2 can build the shop shell while Agent 1 is underway if it uses temporary mock data behind clear boundaries.
4. Agent 3 depends on the database schema and shop components.
5. Agent 4 depends on the cart schema contract and shop components.
6. Agent 5 depends on database access, cart validators, and Stripe configuration.
7. Agent 6 depends on the checkout metadata contract and order schema.
8. Agent 7 depends on persisted order data, though it can start earlier with mock orders.
9. Agent 8 depends on auth, database, validation, public revalidation helpers, and R2.
10. Agent 9, Agent 10, and Agent 11 run near the end for observability, QA, and deployment hardening.

Before parallelizing, agree on these shared contracts:

- Exact table names and exported schema symbols.
- Exact cart payload shape sent to `/api/checkout`.
- Exact order status enum values.
- Exact admin authorization helper signature.
- Exact money formatting helper signature.
- Exact cache tags and revalidation helper names.

## Repository Standards

Agents should follow these conventions unless the repo already establishes a different local pattern:

- TypeScript throughout.
- App Router route groups:
  - `app/(shop)`
  - `app/admin`
  - `app/api`
- Server-only code under `lib/` should be isolated from client imports.
- Database code under `lib/db`.
- Validation schemas under `lib/validators`.
- Server actions under `lib/actions`.
- Cart state under `lib/cart`.
- Email templates under `lib/email`.
- Provider clients under `lib/stripe.ts`, `lib/r2.ts`, `lib/sentry.ts` if needed.
- UI primitives from shadcn should live in `components/ui`.
- Domain components should live in `components/shop`, `components/admin`, or local route folders.
- Format and lint with Biome.
- Tests should be added where the workstream touches money, persistence, validation, auth, or non-trivial UI state.

## Environment Variables

Create `.env.example` with these keys and no secrets:

```env
DATABASE_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
SUPPORT_EMAIL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=
SENTRY_DSN=
NEXT_PUBLIC_APP_URL=
ADMIN_USER_IDS=
SHIPPING_ALLOWED_COUNTRIES=CA,US
SHIPPING_STANDARD_RATE_CENTS=
SHIPPING_FREE_THRESHOLD_CENTS=
```

Hosted Checkout redirect does not require `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` unless a later feature introduces Stripe.js on the client.

## Open Decisions To Resolve Before Go-Live

These do not block scaffolding, database work, catalog, cart, or admin skeletons:

- Store name, logo, color direction, and product photography.
- Real product categories and initial seed catalog.
- Shipping countries. Architecture assumes Canada and United States.
- Shipping rates. V1 uses inline fixed/free shipping options from env values.
- Currency. Architecture assumes CAD.
- Stripe Tax origin address and tax registration setup.
- Production domain and `NEXT_PUBLIC_APP_URL`.
- Admin authorization policy: Clerk org role or `ADMIN_USER_IDS` allowlist.
- R2 public URL strategy: public bucket, custom domain, or CDN.
- Order number format and starting sequence.
- Whether to restock inventory on refund in v1.

## Workstream 0 - Scaffold And Project Foundations

### Goal

Create the Next.js application skeleton with shared tooling, base layout, environment validation, and deployable foundations.

### Dependencies

None.

### Scope

- Initialize Next.js App Router app with TypeScript.
- Configure Bun for local scripts.
- Configure Biome.
- Configure Tailwind.
- Install and initialize shadcn/ui.
- Add base app structure.
- Add `.env.example`.
- Add typed route support if supported by the installed Next.js version.
- Add initial README with architecture summary and local setup.
- Add base error, loading, and not-found routes.

### Suggested Packages

Install the current compatible versions at implementation time:

- `next`
- `react`
- `react-dom`
- `typescript`
- `@biomejs/biome`
- `tailwindcss`
- `zod`
- `drizzle-orm`
- `drizzle-kit`
- `drizzle-zod`
- `postgres` or the selected Neon-compatible driver
- `@clerk/nextjs`
- `stripe`
- `zustand`
- `nuqs`
- `react-hook-form`
- `@hookform/resolvers`
- `resend`
- `@react-email/components`
- `@sentry/nextjs`
- `@aws-sdk/client-s3`
- `@aws-sdk/s3-request-presigner`
- `lucide-react`

### Expected Files

```text
app/
  layout.tsx
  globals.css
  error.tsx
  loading.tsx
  not-found.tsx
  (shop)/
    page.tsx
components/
  ui/
lib/
  env.ts
next.config.ts
biome.json
components.json
.env.example
README.md
```

### Implementation Notes

- Use the screenshots included in this directory as guidance/inspiration (white canvas, with dark sections that frame/highlight), use red and yellow extremely sparingly as accent colors, similar to how site in the screenshots uses yellow and blue.
- Add an environment parser in `lib/env.ts` using Zod. Avoid reading `process.env` directly throughout the app.
- Split server-only secrets from public env values.
- Do not add database logic in this workstream except placeholders or comments.

### Verification

- `bun install`
- `bun run lint`
- `bun run build`
- Start the dev server and confirm the root route renders.

### Acceptance Criteria

- App builds.
- Biome is configured and runnable.
- Tailwind styles apply.
- shadcn components can be added.
- `.env.example` includes all required keys.
- README explains local setup and the high-level architecture.

### Handoff Prompt

```text
You are Agent 0 for the Fuckers HQ build. Scaffold the Next.js 15 App Router project in this repository using Bun locally, Biome, Tailwind, and shadcn/ui. Preserve the architecture decisions in fuckers-hq-architecture.md and fuckers-hq-build-plan.md. Add .env.example, base route structure, typed routes if supported, a Zod env parser, and a concise README. Do not implement database, checkout, admin CRUD, or webhook logic yet. Verify with lint and build.
```

## Workstream 1 - Database, Schema, Migrations, Validation

### Goal

Implement the canonical data model, Drizzle setup, migrations, seed data, and shared Zod schemas.

### Dependencies

Workstream 0.

### Scope

- Configure Drizzle with Neon Postgres.
- Implement tables from the architecture:
  - `products`
  - `product_variants`
  - `product_images`
  - `pending_checkouts`
  - `orders`
  - `order_items`
- Implement enums:
  - `product_status`: `draft`, `active`, `archived`
  - `order_status`: `pending`, `paid`, `fulfilled`, `cancelled`, `refunded`
- Add timestamps and update behavior where practical.
- Generate migrations.
- Add seed script with realistic skate products and variants.
- Add validators with `drizzle-zod`.
- Add checkout/cart validators.
- Add pending checkout validators.
- Add money formatting and order number helpers.

### Expected Files

```text
lib/db/
  client.ts
  schema.ts
  migrate.ts
  seed.ts
drizzle.config.ts
drizzle/
lib/validators/
  cart.ts
  pending-checkout.ts
  product.ts
  order.ts
lib/money.ts
lib/orders/order-number.ts
```

### Schema Requirements

`products`:

- `id` UUID primary key
- `slug` unique text
- `name` text
- `description` nullable text
- `category` nullable text
- `status` enum default `draft`
- `createdAt`
- `updatedAt`

`productVariants`:

- `id` UUID primary key
- `productId` foreign key to products with cascade delete
- `name`
- `sku` unique
- `priceCents` integer
- `inventoryQty` integer default 0

`productImages`:

- `id` UUID primary key
- `productId` foreign key to products with cascade delete
- `url`
- `alt`
- `position` integer default 0

`pendingCheckouts`:

- `id` UUID primary key
- `token` unique text
- `items` jsonb containing validated cart lines
- `stripeSessionId` nullable unique text
- `createdAt`
- `expiresAt`
- `completedAt` nullable timestamp

`orders`:

- `id` UUID primary key
- `orderNumber` unique text
- `email`
- `status` enum default `pending`
- `stripeSessionId` unique text
- `stripePaymentIntentId` nullable text
- `subtotalCents`
- `taxCents`
- `shippingCents`
- `totalCents`
- `currency` default `cad`
- `shippingAddress` jsonb
- `createdAt`

`orderItems`:

- `id` UUID primary key
- `orderId` foreign key to orders with cascade delete
- `variantId` nullable foreign key to product variants with set null on delete
- `productNameSnapshot`
- `variantNameSnapshot`
- `unitPriceCentsSnapshot`
- `quantity`

### Validation Requirements

- `productInsertSchema` and `productUpdateSchema` derived from `products`.
- Variant create/update schemas derived from `productVariants`.
- Image create/update schemas derived from `productImages`.
- Cart schema:

```ts
cartLineSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
});
cartSchema = z.array(cartLineSchema).min(1);
checkoutSchema = z.object({ items: cartSchema });
```

- Admin action inputs must parse `unknown`.
- Route handlers must parse request bodies.
- Stripe Checkout metadata must contain only `pendingCheckoutToken`.
- Webhook must load the pending checkout and parse `pending_checkouts.items` with `cartSchema`.

### Verification

- Generate migration successfully.
- Apply migration to a local or development database.
- Run seed script.
- Confirm products, variants, and images are queryable.
- Add unit tests for validators if the project has a test runner.

### Acceptance Criteria

- Migrations represent the architecture schema.
- Drizzle row types infer correctly.
- Shared validators exist and are exported.
- Seed data includes active products with variants and inventory.
- Price fields are integer cents.
- `stripeSessionId` has a unique constraint.
- `orderItems.variantId` uses `onDelete: "set null"`.

### Handoff Prompt

```text
You are Agent 1 for the Fuckers HQ build. Implement the Drizzle/Neon data layer, migrations, seed script, and shared Zod validation schemas exactly from fuckers-hq-architecture.md and fuckers-hq-build-plan.md. Preserve integer cents, order snapshots, unique stripeSessionId idempotency, and product variant inventory. Add validator exports for products, variants, images, orders, and cart/checkout. Verify migration generation, migration application, seed execution, lint, and build.
```

## Workstream 2 - Shop Shell, UI System, And Layout

### Goal

Build the customer-facing shop shell and reusable UI patterns without implementing the full catalog data flow yet.

### Dependencies

Workstream 0. Can run in parallel with Workstream 1 if using mock data behind clear boundaries.

### Scope

- Build responsive shop layout.
- Add header with navigation, cart link/count, and brand.
- Add footer.
- Add product card component.
- Add empty, loading, error, and not-found presentation.
- Add money display component.
- Add accessible button, badge, select, input, sheet/dialog patterns using shadcn.
- Add route structure for:
  - home
  - catalog
  - product detail
  - cart
  - order success

### Expected Files

```text
app/(shop)/
  layout.tsx
  page.tsx
  products/
    page.tsx
    [slug]/page.tsx
  cart/page.tsx
  order/success/page.tsx
components/shop/
  site-header.tsx
  site-footer.tsx
  product-card.tsx
  price.tsx
  quantity-control.tsx
  empty-state.tsx
```

### Design Requirements

- Use the screenshots included in this directory as guidance/inspiration (white canvas, with dark sections that frame/highlight), use red and yellow extremely sparingly as accent colors, similar to how site in the screenshots uses yellow and blue.
- First screen should feel like a usable shop, not a marketing splash page.
- Use product imagery as a first-class part of the UI.
- Keep UI dense enough for shopping and scanning.
- Use icons from `lucide-react` for cart, search, filters, upload, save, delete, and status actions where appropriate.
- Do not use visible instructional text for obvious UI behavior.
- Do not build decorative card-heavy sections unrelated to shopping.
- Ensure text does not overflow on mobile or desktop.

### Verification

- Check desktop and mobile layouts.
- Verify header/cart count does not shift layout.
- Verify product card text clamps safely.
- Verify route placeholders build.

### Acceptance Criteria

- Shop shell is responsive.
- Common UI states exist.
- Components are ready to receive real Drizzle data.
- No money or inventory logic is duplicated in UI components.

### Handoff Prompt

```text
You are Agent 2 for the Fuckers HQ build. Build the customer-facing shop shell, layout, reusable shop components, and route placeholders. Follow fuckers-hq-architecture.md and fuckers-hq-build-plan.md. Use shadcn/ui, Tailwind, and lucide-react. Make the app feel like a real shop immediately, not a marketing landing page. Do not implement checkout, webhook, admin, or database mutations. Verify responsive layout, lint, and build.
```

## Workstream 3 - Catalog Reads, ISR, Search Params, Product Detail

### Goal

Implement the public product catalog and detail pages using Drizzle reads, Server Components, ISR, and nuqs URL state.

### Dependencies

Workstreams 1 and 2.

### Scope

- Query active products and variants from Postgres.
- Build catalog page with filters, search, sort, and pagination.
- Use nuqs for URL state.
- Build product detail page by slug.
- Show images ordered by position.
- Show available variants, prices, and inventory availability.
- Use ISR for public catalog/detail pages.
- Add cache tags or paths for revalidation from admin mutations.
- Add 404 behavior for missing or inactive products.

### Expected Files

```text
app/(shop)/products/page.tsx
app/(shop)/products/[slug]/page.tsx
components/shop/
  catalog-filters.tsx
  product-grid.tsx
  product-gallery.tsx
  variant-picker.tsx
lib/catalog/
  queries.ts
  cache.ts
```

### Query Requirements

- Public catalog must include only `status = "active"` products.
- Product detail must return 404 for non-active products.
- Sort options should be simple and deterministic:
  - newest
  - price ascending
  - price descending
  - name ascending
- Pagination must have stable page size.
- Filters should support at least category and search.

### Rendering Requirements

- Catalog and product detail should be Server Components by default.
- Interactive filter controls may be client components.
- Product variant selection can be client-side, but price and inventory display must come from server data.
- Add `generateMetadata` for product detail pages.

### Verification

- Seed products appear in catalog.
- URL filter state is shareable and back-button-correct.
- Missing product slug returns 404.
- Inactive products are hidden publicly.
- Revalidation helper can be called from admin actions later.
- Build passes.

### Acceptance Criteria

- Public reads are implemented through Drizzle.
- Catalog uses ISR.
- URL state uses nuqs.
- No client component directly queries the database.
- Product pages are SEO-friendly and include metadata.

### Handoff Prompt

```text
You are Agent 3 for the Fuckers HQ build. Implement the public catalog and product detail pages using Drizzle reads, Server Components, ISR, and nuqs URL state. Only active products should be public. Add filters, sort, pagination, product metadata, and cache revalidation helpers for later admin mutations. Do not implement cart persistence, checkout, webhook, or admin writes. Verify seeded data rendering, 404 behavior, filter URLs, lint, and build.
```

## Workstream 4 - Cart State And Cart UI

### Goal

Implement a persisted client-side cart that stores user intent and display snapshots without trusting client-side prices.

### Dependencies

Workstreams 1 and 2. Product detail integration depends on Workstream 3.

### Scope

- Create Zustand cart store with localStorage persistence.
- Store cart lines with:
  - `variantId`
  - `quantity`
  - display snapshot: product name, variant name, price cents, image URL
- Add add-to-cart behavior from product cards/detail.
- Add cart page.
- Add quantity updates and item removal.
- Add clear-cart behavior.
- Add checkout button that posts only canonical checkout payload shape to `/api/checkout`.
- Add cart count in header.

### Expected Files

```text
lib/cart/
  store.ts
  types.ts
  selectors.ts
components/cart/
  add-to-cart-button.tsx
  cart-line-item.tsx
  cart-summary.tsx
  checkout-button.tsx
app/(shop)/cart/page.tsx
```

### Cart Contract

The store can keep display snapshots for rendering, but the checkout route must receive only:

```ts
{
  items: [{ variantId: 'uuid', quantity: 1 }];
}
```

The checkout route will ignore client-side display prices and re-read prices from Postgres.

### UX Requirements

- Cart survives refresh.
- Quantity controls prevent invalid quantities.
- Empty cart has a clear path back to catalog.
- Checkout button handles loading and error states.
- If checkout creation returns 409 for stock, show a clear message and keep cart editable.

### Verification

- Add, update, remove, and clear cart lines.
- Refresh page and verify cart persists.
- Verify checkout payload excludes trusted price fields.
- Verify header count updates.
- Build passes.

### Acceptance Criteria

- Cart is client-only and persisted.
- Cart snapshot is used only for display.
- Checkout request shape matches `checkoutSchema`.
- Cart UI handles empty, loading, and error states.

### Handoff Prompt

```text
You are Agent 4 for the Fuckers HQ build. Implement the Zustand persisted cart and cart UI. The cart may store display snapshots, but checkout must send only variantId and quantity as defined in fuckers-hq-build-plan.md. Integrate add-to-cart from product surfaces if available. Do not trust client prices. Do not implement Stripe session creation beyond calling /api/checkout from the checkout button. Verify cart persistence, item updates, checkout payload shape, lint, and build.
```

## Workstream 5 - Checkout Session Route

### Goal

Implement the server-authoritative `/api/checkout` route that validates cart input, re-reads prices and inventory, and creates a Stripe hosted Checkout Session.

### Dependencies

Workstreams 1 and 4.

### Scope

- Configure Stripe server client.
- Implement `POST /api/checkout`.
- Parse request JSON with `checkoutSchema`.
- Re-read variants and product data from Postgres.
- Reject missing/inactive/out-of-stock lines.
- Create Stripe Checkout Session using DB prices.
- Enable Stripe Tax.
- Collect shipping address.
- Configure allowed countries.
- Add inline fixed/free shipping options from env.
- Create a `pending_checkouts` row and put only its token into session metadata.
- Return `{ url }`.
- Add tests around validation and line item construction if practical.

### Expected Files

```text
lib/stripe.ts
app/api/checkout/route.ts
lib/checkout/
  assert-in-stock.ts
  build-line-items.ts
```

### Request Contract

```json
{
  "items": [{ "variantId": "uuid", "quantity": 1 }]
}
```

### Response Contract

Success:

```json
{ "url": "https://checkout.stripe.com/..." }
```

Errors:

- `400` for invalid payload.
- `404` for unknown or unavailable variants.
- `409` for insufficient stock.
- `500` for unexpected Stripe/server failure, captured by Sentry later.

### Stripe Requirements

- `mode: "payment"`
- `automatic_tax: { enabled: true }`
- `shipping_address_collection` with allowed countries from config
- `success_url: "${NEXT_PUBLIC_APP_URL}/order/success?session_id={CHECKOUT_SESSION_ID}"`
- `cancel_url: "${NEXT_PUBLIC_APP_URL}/cart"`
- `metadata.pendingCheckoutToken = token`
- Use `price_data.unit_amount` from `productVariants.priceCents`
- Use `currency: "cad"` unless the architecture is explicitly changed

### Important Constraint

Stripe metadata has size limits. V1 uses `pending_checkouts` from the start, so metadata carries only a compact token.

### Verification

- Valid seeded cart creates a Checkout Session in Stripe test mode.
- Manipulated client price has no effect.
- Out-of-stock variant returns 409.
- Invalid UUID returns 400.
- Unknown variant returns 404 or 409 with a clear body.
- Build passes.

### Acceptance Criteria

- Checkout is server-authoritative.
- No client prices are trusted.
- Hosted Checkout redirect URL is returned.
- Stripe Tax is enabled.
- Pending checkout metadata can be parsed by the webhook workstream.

### Handoff Prompt

```text
You are Agent 5 for the Fuckers HQ build. Implement the /api/checkout route using Stripe hosted Checkout and Stripe Tax. Validate input with checkoutSchema, re-read product variant price and stock from Postgres, reject invalid or out-of-stock carts, create a Checkout Session with DB prices, and return the hosted checkout URL. Preserve the metadata cart contract for the webhook. Do not create order rows here. Verify with Stripe test mode or mocks, validation cases, lint, and build.
```

## Workstream 6 - Stripe Webhook, Orders, Inventory, Email Boundary

### Goal

Implement the reliable Stripe webhook that creates paid orders, snapshots items, decrements inventory transactionally, and isolates email failure.

### Dependencies

Workstreams 1 and 5. Email sending can be stubbed until Workstream 7.

### Scope

- Implement `POST /api/webhooks/stripe`.
- Read raw body with `await req.text()`.
- Verify signature using `STRIPE_WEBHOOK_SECRET`.
- Handle `checkout.session.completed`.
- Check `orders.stripeSessionId` idempotency before writes.
- Parse `session.metadata.pendingCheckoutToken`.
- Load the matching pending checkout and parse `pending_checkouts.items` with `cartSchema`.
- Insert order and order items in one transaction.
- Mark the pending checkout completed in the same transaction.
- Use Stripe session amounts for subtotal, tax, shipping, total, currency.
- Snapshot product and variant names and unit price from Postgres.
- Conditionally decrement inventory inside the transaction.
- Send or enqueue order confirmation after commit.
- Catch and report email errors without failing persisted orders.
- Optionally handle refund events by marking `refunded`.

### Expected Files

```text
app/api/webhooks/stripe/route.ts
lib/orders/
  create-paid-order.ts
  snapshot-line.ts
  order-number.ts
lib/inventory/
  decrement.ts
```

### Webhook Reliability Requirements

- Never parse JSON body before signature verification.
- Always return 400 for invalid signature.
- Return 200 quickly for ignored event types.
- Duplicate `checkout.session.completed` events must not create duplicate orders.
- The transaction must fail if a line cannot be snapshotted or inventory cannot be decremented.
- If the transaction fails, return a non-2xx status so Stripe retries.
- Email must run after commit.
- Email failure after commit should be captured and should still return 200 to Stripe.

### Inventory Race Requirement

The update must be equivalent to:

```sql
UPDATE product_variants
SET inventory_qty = inventory_qty - $quantity
WHERE id = $variantId
  AND inventory_qty >= $quantity;
```

The code must verify that exactly one row was affected for each line.

### Order Snapshot Requirement

For each cart line, query current product and variant data and write:

- `variantId`
- `productNameSnapshot`
- `variantNameSnapshot`
- `unitPriceCentsSnapshot`
- `quantity`

### Verification

- Use Stripe CLI locally:
  - `stripe listen --forward-to localhost:3000/api/webhooks/stripe`
  - Complete a real test Checkout Session when possible.
- Confirm one order row appears.
- Confirm order items appear with snapshots.
- Confirm inventory decrements.
- Re-send the same event and confirm no duplicate order.
- Force email failure and confirm order still exists and webhook returns success after commit.
- Invalid signature returns 400.

### Acceptance Criteria

- Webhook is idempotent.
- Order creation and inventory decrement are transactional.
- Order data uses Stripe authoritative totals.
- Email failure is isolated.
- Duplicate events do not duplicate orders.

### Handoff Prompt

```text
You are Agent 6 for the Fuckers HQ build. Implement the Stripe webhook and paid order creation path. Use raw body signature verification, idempotency through unique stripeSessionId, cart metadata validation, transactional order creation, order item snapshots, and conditional inventory decrement. Email must happen only after commit and must not break persisted orders. Do not create orders in /api/checkout. Verify duplicate event behavior, inventory decrement, invalid signatures, lint, and build.
```

## Workstream 7 - Order Confirmation Email

### Goal

Implement Resend and React Email order confirmations that can be called safely after order persistence.

### Dependencies

Workstream 6. Can begin earlier with mock order data.

### Scope

- Configure Resend client.
- Create React Email template.
- Implement `sendOrderConfirmation(orderId)` or equivalent.
- Query persisted order and items from Postgres.
- Send order summary, shipping address, totals, and support contact.
- Add a preview or local render path if practical.
- Ensure email sender errors can be caught by the webhook caller.

### Expected Files

```text
lib/email/
  resend.ts
  send-order-confirmation.ts
  templates/order-confirmation.tsx
```

### Email Requirements

- Use persisted database order data, not client cart data.
- Include:
  - order number
  - item names, variants, quantities
  - subtotal, tax, shipping, total
  - shipping address if available
  - support/contact line
- Avoid leaking Stripe secrets or internal IDs.
- Keep styling simple and email-client friendly.

### Verification

- Render template with seed/test order.
- Send test email through Resend test mode or configured dev domain.
- Force `RESEND_API_KEY` missing or bad and confirm caller can catch error.
- Build passes.

### Acceptance Criteria

- Email is generated from persisted order data.
- Email function is callable from webhook after commit.
- Failure propagates as an exception for caller to catch and report.

### Handoff Prompt

```text
You are Agent 7 for the Fuckers HQ build. Implement Resend and React Email order confirmation support. Generate emails from persisted order and order item data, not client cart data. Include order number, line items, totals, and shipping details. Make the sending function safe for the webhook to call after commit and allow errors to be caught by the caller. Verify template rendering, a test send or mock, lint, and build.
```

## Workstream 8 - Admin Auth, Product CRUD, Orders, R2 Uploads

### Goal

Build the Clerk-gated admin area for managing products, variants, images, inventory, and orders.

### Dependencies

Workstreams 1, 2, 3, and 6. R2 upload pieces can start once environment config exists.

### Scope

- Configure Clerk middleware.
- Implement `requireAdmin()` server helper.
- Protect `/admin/*` in middleware and server code.
- Build admin layout.
- Implement product list/create/edit/archive.
- Implement variant CRUD under product edit.
- Implement price and inventory editing.
- Implement product image management.
- Implement R2 presigned upload URL endpoint or server action.
- Save uploaded image public URLs in `product_images`.
- Implement orders list and order detail.
- Implement mark fulfilled action.
- Add basic stats dashboard if time permits.
- Revalidate public catalog and product pages after product mutations.

### Expected Files

```text
middleware.ts
lib/auth/require-admin.ts
app/admin/
  layout.tsx
  page.tsx
  products/
    page.tsx
    new/page.tsx
    [id]/page.tsx
  orders/
    page.tsx
    [id]/page.tsx
app/api/admin/upload-url/route.ts
lib/actions/
  products.ts
  variants.ts
  images.ts
  orders.ts
lib/r2.ts
components/admin/
  product-form.tsx
  variant-form.tsx
  image-uploader.tsx
  order-status-badge.tsx
```

### Auth Requirements

- Clerk middleware protects `/admin`.
- Server actions and admin route handlers call `requireAdmin()`.
- `requireAdmin()` should check either:
  - Clerk org role, if orgs are configured, or
  - `ADMIN_USER_IDS` allowlist for a single admin setup.
- Unauthorized users receive a clear 404, redirect, or 403 based on app pattern.

### Admin Form Requirements

- React Hook Form with `zodResolver`.
- Schemas derived with `drizzle-zod` where practical.
- Server actions accept `unknown` and parse again server-side.
- Slug validation should allow lowercase letters, numbers, and hyphens.
- Price input should be user-friendly but stored as integer cents.
- Inventory input must be integer and non-negative.

### R2 Upload Requirements

- Admin requests a presigned PUT URL.
- Browser uploads directly to R2.
- Server returns the final public URL.
- Product image row is saved only after successful upload.
- Validate content type and file size.
- Use unique object keys, such as `products/{productId}/{uuid}-{safeFilename}`.

### Order Admin Requirements

- List orders newest first.
- Show status, order number, email, total, created date.
- Order detail shows line snapshots, totals, shipping address, Stripe session/payment IDs, and fulfillment status.
- Mark fulfilled updates status to `fulfilled`.
- Do not let admin mutate financial totals.

### Revalidation Requirements

After product, variant, inventory, or image mutation:

- Revalidate product list cache.
- Revalidate affected product slug path or tag.
- Consider revalidating home if it shows featured products.

### Verification

- Non-admin cannot access `/admin`.
- Admin can create product, variants, and images.
- New active product appears in public catalog after revalidation.
- Edited price/inventory affects checkout route because checkout re-reads DB.
- Admin can view orders created by webhook.
- Admin can mark an order fulfilled.
- R2 upload uses direct browser upload.
- Build passes.

### Acceptance Criteria

- Admin is protected at middleware and server-action layers.
- Product CRUD works.
- Variant price/inventory edits work.
- Image upload avoids server file proxying.
- Public ISR pages update after admin changes.
- Admin order management covers order viewing and fulfillment.

### Handoff Prompt

```text
You are Agent 8 for the Fuckers HQ build. Implement the Clerk-gated admin area, including requireAdmin, product/variant/image CRUD, inventory and price edits, R2 presigned direct uploads, order list/detail, and mark-fulfilled action. Use React Hook Form, zodResolver, drizzle-zod validators, and server-side parsing in every action. Revalidate public catalog/product pages after mutations. Do not let admin edit financial order totals. Verify auth, CRUD, R2 upload flow, revalidation, lint, and build.
```

## Workstream 9 - Observability, Error Handling, And Security Hardening

### Goal

Add Sentry, structured error handling, and security checks around critical surfaces.

### Dependencies

Workstreams 0 through 8, or enough app surfaces to instrument.

### Scope

- Configure Sentry for Next.js.
- Capture errors in:
  - checkout route
  - webhook
  - admin server actions
  - R2 upload URL route
  - email sending
- Add user-safe error responses.
- Add server logs or structured context where helpful.
- Review env validation.
- Review server/client import boundaries.
- Add rate limiting or basic abuse protection where practical for checkout and upload URL routes.
- Add security headers if not handled by hosting defaults.

### Critical Reviews

- Confirm no secret env vars are exposed to client bundles.
- Confirm Stripe secret key is server-only.
- Confirm R2 secret keys are server-only.
- Confirm webhook route does not parse JSON before signature verification.
- Confirm admin actions call `requireAdmin()`.
- Confirm checkout ignores client price snapshots.
- Confirm Sentry does not record sensitive payment data unnecessarily.

### Verification

- Trigger a checkout route error and confirm Sentry capture.
- Trigger webhook invalid signature and confirm 400 without noisy Sentry alert.
- Trigger email failure and confirm Sentry capture.
- Run lint and build.

### Acceptance Criteria

- Critical errors are observable.
- Expected validation failures return clean responses.
- Secrets are not exposed client-side.
- Admin and money paths have explicit server-side checks.

### Handoff Prompt

```text
You are Agent 9 for the Fuckers HQ build. Add Sentry and harden error handling around checkout, webhook, admin actions, R2 upload URLs, and email sending. Review server/client boundaries and secret exposure. Expected validation failures should return clean responses; unexpected failures should be captured. Do not log sensitive payment details. Verify Sentry capture paths, invalid webhook behavior, lint, and build.
```

## Workstream 10 - Testing And QA

### Goal

Add focused automated and manual tests for the highest-risk behavior.

### Dependencies

All implementation workstreams, though tests can be added incrementally.

### Scope

- Add unit tests for validators and helpers.
- Add integration tests for checkout line item construction.
- Add tests for webhook idempotency and inventory decrement logic where practical.
- Add component tests or Playwright smoke tests for public shop and cart.
- Add admin smoke tests if Clerk test setup is feasible.
- Create manual QA checklist.

### Suggested Test Coverage

Validators:

- `checkoutSchema` rejects empty carts.
- `checkoutSchema` rejects invalid UUIDs.
- Product slug schema rejects uppercase and spaces.
- Price/inventory schemas reject invalid numbers.

Checkout:

- Uses DB price, not client snapshot.
- Rejects insufficient stock.
- Rejects unknown variant.
- Creates Stripe line items with integer cents.

Webhook:

- Rejects invalid signature.
- Duplicate session ID does not duplicate orders.
- Inventory decrements once.
- Order items snapshot current names and prices.
- Email failure after commit does not remove order.

Cart:

- Add line.
- Merge same variant quantities.
- Update quantity.
- Remove line.
- Persist after refresh.
- Checkout payload strips display snapshot data.

Admin:

- Non-admin blocked.
- Product create/edit/archive.
- Variant inventory update.
- Image upload URL generation.
- Mark order fulfilled.

Manual Stripe QA:

- Start local dev server.
- Start Stripe CLI forwarding to webhook.
- Create test checkout from seeded product.
- Complete payment with Stripe test card.
- Confirm success page.
- Confirm order in admin.
- Confirm inventory decreased.
- Confirm confirmation email behavior.
- Replay webhook event and confirm no duplicate order.

### Acceptance Criteria

- Money and webhook logic have automated coverage or explicit manual coverage if mocking is too costly.
- Cart payload contract is tested.
- Manual QA checklist is committed.
- Lint and build pass.

### Handoff Prompt

```text
You are Agent 10 for the Fuckers HQ build. Add focused tests and a manual QA checklist for validators, checkout, webhook idempotency, inventory decrement, cart behavior, and admin essentials. Prioritize money path and persistence risks over broad snapshot tests. Use the repo's existing test tools if present; otherwise add a minimal test setup compatible with the stack. Verify tests, lint, and build.
```

## Workstream 11 - Deployment And Go-Live

### Goal

Prepare the app for production deployment on Vercel Pro and document operational steps.

### Dependencies

All prior workstreams.

### Scope

- Configure Vercel project.
- Configure production environment variables.
- Configure Neon production database.
- Run production migration.
- Seed or import initial real catalog.
- Configure Stripe live mode.
- Register production webhook endpoint.
- Configure Stripe Tax origin and registrations.
- Configure shipping rates.
- Configure Resend production domain.
- Configure R2 bucket, keys, and public URL.
- Configure Sentry project and release environment.
- Add go-live checklist to README or `docs/go-live.md`.

### Production Checklist

- Vercel plan is Pro for commercial use.
- Domain is connected.
- `NEXT_PUBLIC_APP_URL` is production URL.
- Neon production branch is selected.
- Production database migration applied.
- Stripe live secret key configured.
- Stripe production webhook endpoint registered:
  - `/api/webhooks/stripe`
  - event: `checkout.session.completed`
  - optional event: refund event if implemented
- Stripe Tax configured:
  - origin address
  - registrations
  - product tax behavior
- Shipping options configured in Stripe or env.
- Resend domain verified.
- R2 bucket public URL works.
- Admin Clerk account configured.
- `ADMIN_USER_IDS` or org role configured.
- Sentry DSN configured.
- Spend alerts configured for Neon and Stripe where available.
- Test product hidden or removed.
- Real catalog active.
- Robots and metadata reviewed.
- Smoke test with a low-value real purchase.
- Refund test documented if refund handling exists.

### Acceptance Criteria

- Production deployment succeeds.
- Production webhook receives Stripe events.
- A real test order can be completed end to end.
- Admin can fulfill the order.
- Rollback path is documented.

### Handoff Prompt

```text
You are Agent 11 for the Fuckers HQ build. Prepare deployment and go-live documentation for Vercel Pro, Neon, Stripe live mode, Stripe Tax, production webhook registration, Resend, R2, Clerk admin, Sentry, and smoke testing. Do not invent secrets. Add a clear go-live checklist and verify production build readiness.
```

## Workstream 12 - Returns And Exchanges (Future V2)

### Goal

Add a secure, auditable workflow for partial or full returns, refunds, restocking, and exchange replacements after the v1 store is stable.

### Dependencies

Paid order persistence, admin authorization, shipped-order management, Stripe webhook handling, inventory controls, and transactional email.

### Scope

- Add separate `returns` and `return_items` records instead of overloading `orders.status`.
- Support admin-created partial and full returns against immutable order-item snapshots.
- Track requested, approved, received, completed, and cancelled return states.
- Record per-item quantities, reason, resolution, notes, and whether inventory was restocked.
- Issue refunds through Stripe using server-calculated amounts and idempotency keys.
- Reconcile asynchronous Stripe refund events without duplicating refunds or inventory changes.
- Support exchanges as traceable replacement shipments or replacement orders.
- Send return, refund, and exchange emails only after persistence succeeds.
- Define secure guest order verification before adding a customer-initiated return request flow.

### Architecture Guardrails

- Returned quantities cannot exceed purchased quantities minus prior completed returns.
- The browser never decides refund amounts, refund status, or inventory adjustments.
- Restocking is explicit and transactional; a refund does not automatically imply an item is resellable.
- Partial returns must not erase the original paid or shipped order state.
- Stripe is authoritative for payment refund state; Postgres stores the operational return workflow.
- Existing order-item snapshots remain immutable.
- Automated return labels, carrier integrations, and customer accounts remain separate scope decisions.

### Acceptance Criteria

- Admin can process partial and full returns without mutating original order financial snapshots.
- Stripe retries cannot create duplicate refunds.
- Inventory changes occur once and only for explicitly restocked items.
- Exchanges retain a clear link between the original item and its replacement fulfillment.
- Guest return access, if implemented, cannot expose orders using only a guessable order number.

### Handoff Prompt

```text
You are Agent 12 for the Fuckers HQ build. Design and implement a V2 returns and exchanges workflow using separate return records, immutable original order snapshots, Stripe-authoritative refunds, idempotent webhook reconciliation, explicit transactional restocking, and traceable replacement fulfillment. Support partial returns. Do not let clients calculate refunds or expose guest orders through guessable identifiers. Resolve the deferred customer-request and carrier-label decisions before implementation.
```

## Cross-Workstream Contracts

### Cart Payload

Public cart store may contain:

```ts
type CartDisplayLine = {
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  priceCents: number;
  imageUrl?: string | null;
};
```

Checkout request must contain only:

```ts
type CheckoutRequest = {
  items: Array<{
    variantId: string;
    quantity: number;
  }>;
};
```

### Order Statuses

Allowed statuses:

- `pending`
- `paid`
- `fulfilled`
- `cancelled`
- `refunded`

V1 expected transitions:

- Webhook creates `paid`.
- Admin can move `paid` to `fulfilled`.
- Admin UI labels the persisted `fulfilled` state as `Shipped` for storefront operations.
- Optional refund handler can move any paid/fulfilled order to `refunded`.
- `pending` is reserved by schema but should not normally be created in v1 because orders are born on webhook completion.

### Cache Tags

Use stable tag constants, for example:

```ts
export const CACHE_TAGS = {
  products: 'products',
  product: (slug: string) => `product:${slug}`,
  home: 'home',
} as const;
```

Admin product mutations should revalidate:

- `products`
- affected `product:${slug}`
- `home` if the home page shows products

### Admin Authorization

Provide one helper used everywhere:

```ts
export async function requireAdmin(): Promise<{ userId: string }> {
  // Clerk auth plus org role or ADMIN_USER_IDS allowlist.
}
```

Server actions and admin route handlers must call this helper before mutating or exposing admin data.

### Money Helpers

Use one helper for display:

```ts
formatMoney(cents: number, currency = "CAD"): string
```

Use one helper for form conversion:

```ts
dollarsToCents(input: string | number): number
centsToDollars(cents: number): string
```

Do not use floating point values for persisted money.

## Definition Of Done

The build is done when:

- Public catalog and product detail pages render active products from Postgres.
- Cart persists locally and sends only variant IDs and quantities to checkout.
- Checkout creates Stripe hosted Checkout Sessions with DB prices and Stripe Tax.
- Webhook verifies signatures, creates paid orders, snapshots line items, decrements inventory, and handles duplicate events safely.
- Confirmation email sends from persisted order data after commit.
- Admin can manage products, variants, images, inventory, and order fulfillment.
- R2 direct uploads work from admin.
- ISR revalidates after product changes.
- Sentry captures unexpected failures on critical server paths.
- `.env.example`, README, and go-live checklist are current.
- Lint, build, and focused tests pass.
- Manual Stripe QA has been completed in test mode.
- Production deployment checklist is complete before accepting real customers.

## Final Agent Instructions

Every implementation agent should start by reading:

1. `fuckers-hq-architecture.md`
2. `fuckers-hq-build-plan.md`
3. Existing README and package scripts
4. The files in their assigned workstream

Every agent should report:

- Files changed.
- Architecture decisions preserved.
- Tests or commands run.
- Any skipped verification and why.
- Any contract changes that downstream agents must know.

Agents should not:

- Replace hosted Checkout with embedded/custom payment UI.
- Add customer accounts.
- Trust client-side prices.
- Create orders before payment completion.
- Skip webhook signature verification.
- Add broad unrelated refactors.
- Commit secrets.
- Change the schema contract without updating this plan and notifying downstream agents.
