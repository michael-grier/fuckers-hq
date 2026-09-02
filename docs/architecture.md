# Fuckers HQ — Architecture

The Fuckers HQ storefront is optimized for **reliability without ongoing babysitting**, low operating cost, and portfolio value. Payments, tax, and the payment UI are offloaded to Stripe; everything customer-facing is guest checkout; the catalog and orders live in Postgres.

---

## Final stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | RSC for catalog, ISR for product pages |
| Tooling runtime / PM | Bun (dev), Node on Vercel (prod) | Bun for local + scripts; prod runtime is Node via Vercel |
| Hosting | Vercel **Pro** | Commercial use requires Pro (~$20/mo) — not optional for a real store |
| Database | **Neon** Postgres | Serverless, scale-to-zero, branchable |
| ORM | **Drizzle** | SQL-first, type-safe |
| Auth | Clerk | **Admin only** — customers use guest checkout |
| Payments | Stripe **hosted Checkout** + **Stripe Tax** | Server-authoritative; redirect flow |
| Image storage | **Cloudflare R2** | S3-compatible, presigned direct upload |
| UI | shadcn/ui + Tailwind | |
| Validation & types | Zod + **drizzle-zod** + React Hook Form | Schemas derived from the Drizzle schema — one source of truth for types *and* runtime validation |
| Client state | Zustand + localStorage | Cart only |
| URL state | nuqs | Catalog filters / sort / pagination |
| Email | Resend + React Email | Transactional customer and admin notifications |
| Errors | Sentry | Wraps the webhook + admin actions |
| Lint/format | Biome | |

**Monthly run-rate:** ~$20 (Vercel) + domain, with Neon / Clerk / Resend / R2 / Sentry all within free tiers at this volume. Variable cost is Stripe's ~2.9% + 30¢ per sale.

---

## Where every piece of state lives

This is the spine of the design — each kind of state has exactly one owner.

- **Postgres (source of truth for catalog & orders):** products, variants, inventory, images, orders, order_items.
- **Stripe (source of truth for money):** the actual charge, tax calculation, payment status, customer/shipping details. Mirrored *into* `orders` on webhook — never the other way.
- **Zustand + localStorage (ephemeral):** the in-progress cart — variant IDs, quantities, and a display snapshot (name/price/image) so the cart renders without a refetch. **Never trusted for pricing.**
- **URL via nuqs:** catalog filters, sort, search, pagination.
- **Clerk:** admin identity only.
- **Next.js ISR cache:** rendered catalog/product pages, revalidated on product edits.

The golden rule: **the client cart decides what the user wants to buy; the server decides what it costs.** Prices are always re-read from Postgres when creating the Checkout session.

---

## Data model (Drizzle / Postgres)

```ts
export const productStatus = pgEnum("product_status", ["draft", "active", "archived"]);
export const orderStatus   = pgEnum("order_status", ["pending", "paid", "fulfilled", "cancelled", "refunded"]);

export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),                 // "hardgoods" | "softgoods" | "accessories"
  status: productStatus("status").notNull().default("draft"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productVariants = pgTable("product_variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),               // "Large", "8.25\""
  sku: text("sku").notNull().unique(),
  priceCents: integer("price_cents").notNull(),   // canonical price, integer cents
  inventoryQty: integer("inventory_qty").notNull().default(0),
});

export const productImages = pgTable("product_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  url: text("url").notNull(),                  // R2 public URL
  alt: text("alt"),
  position: integer("position").notNull().default(0),
});

export const pendingCheckouts = pgTable("pending_checkouts", {
  id: uuid("id").defaultRandom().primaryKey(),
  token: text("token").notNull().unique(),      // stored in Stripe metadata
  items: jsonb("items").notNull(),              // validated cart lines
  stripeSessionId: text("stripe_session_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  completedAt: timestamp("completed_at"),
});

export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNumber: text("order_number").notNull().unique(),     // human-readable, e.g. FHQ-1042
  email: text("email").notNull(),
  status: orderStatus("status").notNull().default("pending"),
  stripeSessionId: text("stripe_session_id").notNull().unique(),  // <- idempotency key
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  subtotalCents: integer("subtotal_cents").notNull(),
  taxCents: integer("tax_cents").notNull().default(0),
  shippingCents: integer("shipping_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  currency: text("currency").notNull().default("cad"),
  shippingAddress: jsonb("shipping_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  variantId: uuid("variant_id").references(() => productVariants.id, { onDelete: "set null" }),
  productNameSnapshot: text("product_name_snapshot").notNull(),  // snapshot @ purchase time
  variantNameSnapshot: text("variant_name_snapshot").notNull(),
  unitPriceCentsSnapshot: integer("unit_price_cents_snapshot").notNull(),
  quantity: integer("quantity").notNull(),
});
```

**Modeling decisions worth defending in your README:**
- **Integer cents everywhere.** Never floats for money.
- **Snapshots on `order_items`.** A historical order must stay accurate even after the product is renamed, repriced, or deleted (`onDelete: "set null"` on the variant FK, not cascade).
- **`stripeSessionId` is `unique`.** This is your webhook idempotency guard — duplicate events can't create duplicate orders.
- **No `users` table.** Auth is Clerk (admin); customers are identified by the email Stripe collects.
- **Variants carry price + inventory.** Decks have sizes, apparel has S/M/L/XL — a realistic one-to-many that also demonstrates schema design.

*Defer to v2:* collections/categories as a real table, discount codes (Stripe Coupons can cover this), customer accounts, wishlists.

---

## Type safety (end-to-end)

The goal here isn't a new tool — in this stack most of the chain is **already type-safe by construction**, and the remaining gaps are all *runtime boundaries* that one shared Zod layer closes.

**Already safe (no work needed):**
- **DB → server:** Drizzle infers row types from the schema (`$inferSelect` / `$inferInsert`). Queries are typed; no codegen, no drift.
- **Server → client (reads):** catalog data is fetched in Server Components and passed to client components **as props** — plain typed TypeScript, no network type boundary to bridge.
- **Client → server (mutations):** **Server Actions** type their arguments and return value across the client/server RPC boundary at compile time. This is Next's native end-to-end mechanism and covers every admin write.
- **Stripe / Resend SDKs:** already fully typed.

**The real gaps — every one is a runtime boundary:**

| Boundary | Hole | Fix |
|---|---|---|
| `await req.json()` in `/api/checkout` | `any` | `.parse()` with a Zod schema |
| `JSON.parse(session.metadata.cart)` in the webhook | `any` — and it's the money path | `.parse()` with the same cart schema |
| Admin form inputs | unvalidated | RHF + `zodResolver` |
| Server Action inputs | compile-time typed, **not** runtime-validated | `.parse()` inside the action |

**The pattern: one Zod layer, anchored to the Drizzle schema via `drizzle-zod`.** Schemas are *derived from* your tables, so validation can't drift from the database, and each schema yields both the runtime validator and (via `z.infer`) the TS type.

```ts
// lib/validators/product.ts — one source of truth
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { products } from "@/lib/db/schema";

export const productInsertSchema = createInsertSchema(products, {
  name: (s) => s.min(1, "Name is required"),
  slug: (s) => s.regex(/^[a-z0-9-]+$/, "Lowercase and hyphens only"),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type ProductInsert = z.infer<typeof productInsertSchema>;   // type derived, not hand-written
```

```tsx
// app/admin/products/product-form.tsx  ("use client")
const form = useForm<ProductInsert>({ resolver: zodResolver(productInsertSchema) });
const onSubmit = (data: ProductInsert) => createProduct(data);    // typed Server Action call
```

```ts
// lib/actions/product.ts  ("use server")
export async function createProduct(input: unknown) {
  const data = productInsertSchema.parse(input);   // runtime gate — the caller is never trusted
  await requireAdmin();                            // Clerk authz
  await db.insert(products).values(data);
  revalidateTag("products");
}
```

End to end, the chain is: **Drizzle table → `drizzle-zod` schema → `z.infer` type → form validation → server `.parse()` → typed insert.** One definition drives all of it.

The same idea closes the money-path hole — a single cart schema guards **both** the checkout entry point and the webhook metadata:

```ts
// lib/validators/cart.ts
export const cartLineSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().int().positive(),
});
export const cartSchema     = z.array(cartLineSchema).min(1);   // reused in /api/checkout AND the webhook
export const checkoutSchema = z.object({ items: cartSchema });
export type CartLine = z.infer<typeof cartLineSchema>;
```

**Cheap extra:** turn on Next's **typed routes** (`typedRoutes`) so `<Link href>` and router navigation are type-checked too — extends safety to the routing layer for ~zero cost.

**Why not tRPC here:** its headline value (typed client calls without codegen) was built for the Pages-Router / client-fetching world. In the App Router, RSC covers reads and Server Actions cover writes, so tRPC overlaps with primitives you already have — and the genuine client→server call surface here is tiny (checkout, an optional stock check, admin actions). Adding it would be ceremony a sharp reviewer could read as over-engineering. It earns its place only with a *separate* client (React Native, an external API consumer), a large structured API surface, or a strong DX preference — none of which applies to the Fuckers HQ storefront.

---

## The four flows

### 1. Browse → Cart (client-side, no money)

- Product list + detail render as **Server Components** reading Postgres via Drizzle, statically generated with **ISR**. Catalog views serve from cache and hit the DB ~never.
- `nuqs` holds filter/sort/pagination in the URL (shareable, back-button-correct).
- "Add to cart" writes `{ variantId, quantity }` + a display snapshot into the **Zustand** store (persisted to localStorage). This snapshot is for rendering only.

### 2. Checkout (the money path — server-authoritative)

```ts
// app/api/checkout/route.ts  (sketch)
export async function POST(req: Request) {
  const { items } = checkoutSchema.parse(await req.json());   // [{ variantId, quantity }], Zod-validated

  // Re-read authoritative price + stock from Postgres. Do NOT trust the client.
  const variants = await db.select().from(productVariants)
    .where(inArray(productVariants.id, items.map(i => i.variantId)));

  assertInStock(variants, items);   // 409 if anything is short

  const lineItems = items.map(i => {
    const v = variants.find(x => x.id === i.variantId)!;
    return {
      quantity: i.quantity,
      price_data: {
        currency: "cad",
        unit_amount: v.priceCents,            // price from DB, not client
        product_data: { name: displayName(v) /* tax_code set here or as account default */ },
        tax_behavior: "exclusive",
      },
    };
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    automatic_tax: { enabled: true },                         // Stripe Tax
    shipping_address_collection: { allowed_countries: ["CA", "US"] },
    shipping_options: [/* inline fixed/free shipping options from env */],
    success_url: `${APP_URL}/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/cart`,
    metadata: { pendingCheckoutToken },                       // compact metadata only
  });

  return Response.json({ url: session.url });                 // client redirects here
}
```

- **No order row is created yet.** The order is born on the webhook, so the `orders` table only ever contains real, paid orders (no abandoned-cart cruft).
- Cart line refs are stored in a short-lived `pending_checkouts` row. Stripe metadata carries only the pending checkout token, avoiding metadata size limits.
- With hosted Checkout you just redirect to `session.url` — **you may not need Stripe.js or the publishable key on the client at all.**

### 3. Stripe webhook (the single most important reliability surface)

```ts
// app/api/webhooks/stripe/route.ts  (sketch)
export async function POST(req: Request) {
  const body = await req.text();                              // RAW body required for signature check
  const sig  = req.headers.get("stripe-signature")!;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;

    // Idempotency: webhooks can fire more than once.
    const seen = await db.select().from(orders).where(eq(orders.stripeSessionId, s.id)).limit(1);
    if (seen.length) return new Response("ok");

    const { pendingCheckoutToken } = pendingCheckoutMetadataSchema.parse(s.metadata);
    const pendingCheckout = await getPendingCheckout(pendingCheckoutToken);
    const cart = cartSchema.parse(pendingCheckout.items);      // runtime-validate persisted cart refs

    await db.transaction(async (tx) => {
      const [order] = await tx.insert(orders).values({
        orderNumber: nextOrderNumber(),
        email: s.customer_details!.email!,
        stripeSessionId: s.id,
        stripePaymentIntentId: s.payment_intent as string,
        subtotalCents: s.amount_subtotal!,                    // Stripe's authoritative amounts
        taxCents: s.total_details?.amount_tax ?? 0,
        shippingCents: s.shipping_cost?.amount_total ?? 0,
        totalCents: s.amount_total!,
        currency: s.currency!,
        shippingAddress: s.shipping_details,
        status: "paid",
      }).returning();

      for (const line of cart) {
        // conditional decrement prevents overselling under races
        await tx.update(productVariants)
          .set({ inventoryQty: sql`${productVariants.inventoryQty} - ${line.quantity}` })
          .where(and(eq(productVariants.id, line.variantId),
                     gte(productVariants.inventoryQty, line.quantity)));
        await tx.insert(orderItems).values(snapshotFor(order.id, line));
      }
    });

    // Email AFTER the DB commit, wrapped so a Resend hiccup can't 500 the webhook
    try { await sendOrderConfirmation(order); }
    catch (e) { Sentry.captureException(e); }
  }

  return new Response("ok");                                  // 200 fast
}
```

Four non-negotiables baked in above: **signature verification on the raw body**, **idempotency via the unique session ID**, **transactional + conditional inventory decrement**, and **email failure isolated from order persistence** (the order is saved before the email is attempted). Optionally also handle `charge.refunded` → mark refunded + restock.

### 4. Admin (Clerk-gated)

- `/admin/*` protected by Clerk middleware **plus** a server-side check (org role or an allowlist of admin user IDs — for a single admin, an allowlist is fine).
- Capabilities: CRUD products + variants, set price/inventory, upload images, view orders, mark orders `fulfilled`, basic stats.
- **Image upload:** admin form requests a presigned PUT URL from a server action → browser uploads **directly to R2** → the returned public URL is saved to `product_images`. Large files never touch your server.
- On any product mutation, call `revalidateTag`/`revalidatePath` so ISR catalog pages pick up the change.

---

## Rendering strategy

| Surface | Strategy | Why |
|---|---|---|
| Product list / detail | RSC + ISR (`revalidate` + on-demand revalidate on edit) | Fast, SEO-friendly, ~zero DB load |
| Cart | Client component (Zustand) | Purely client state |
| Checkout / webhook | Route handlers | Server-only, security-critical |
| Admin | Dynamic RSC | Always fresh, low traffic |

---

## Folder structure

```
app/
  (shop)/
    page.tsx                 # home / featured
    products/
      page.tsx               # catalog (RSC + ISR, nuqs filters)
      [slug]/page.tsx        # product detail
    cart/page.tsx            # client (Zustand)
    order/success/page.tsx   # post-checkout confirmation
  admin/
    layout.tsx               # Clerk gate + role check
    products/...             # product/variant CRUD
    orders/...               # order list + fulfillment
  api/
    checkout/route.ts        # creates Stripe Checkout session
    webhooks/stripe/route.ts # order creation + inventory + email
    admin/upload-url/route.ts# presigned R2 URL
lib/
  db/                        # drizzle client + schema + migrations
  stripe.ts                  # configured Stripe client
  r2.ts                      # S3 client for R2
  email/                     # React Email templates + Resend send
  cart/                      # Zustand store
  validators/                # Zod schemas derived via drizzle-zod (one source of truth)
  actions/                   # "use server" Server Actions (typed mutations, .parse() inputs)
```

---

## Environment variables

```
DATABASE_URL=                  # Neon (pooled connection string)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
RESEND_API_KEY=
EMAIL_FROM=
ADMIN_ORDER_EMAIL=
SUPPORT_EMAIL=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_URL=                 # public bucket or CDN domain for image URLs
SENTRY_DSN=
NEXT_PUBLIC_APP_URL=
ADMIN_USER_IDS=
SHIPPING_ALLOWED_COUNTRIES=CA,US
SHIPPING_FREE_THRESHOLD_CENTS=
```

Note: hosted Checkout via redirect means you likely **don't** need `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

---

## Build sequence

Build in this order so each phase is testable before the next depends on it:

1. **Scaffold** — Next.js + Bun + Biome + Tailwind + shadcn. Deploy an empty skeleton to Vercel Pro early so deployment is never the surprise at the end.
2. **Database + schema layer** — Neon project, Drizzle schema + first migration, seed a few products/variants. Generate the shared Zod schemas from the tables with `drizzle-zod` now — this becomes the validation source of truth every later phase reuses.
3. **Catalog** — product list + detail (RSC + ISR), nuqs filters.
4. **Cart** — Zustand store + localStorage persistence, cart UI.
5. **Checkout** — Checkout session route, Stripe Tax, shipping options, redirect.
6. **Webhook** — order creation + transactional inventory decrement + idempotency. Test with the Stripe CLI (`stripe listen` / `stripe trigger`).
7. **Email** — Resend + React Email notifications through the durable order outbox.
8. **Admin** — Clerk gate, product/order management, R2 presigned uploads.
9. **Sentry + polish** — error monitoring, loading/error states, empty states, 404s.
10. **Go-live checklist** — switch Stripe to live keys, register the **production** webhook endpoint, configure Stripe Tax origin + Canadian GST/HST registration, set a Neon/Stripe spend alert, smoke-test a real $1 purchase.

---

## Gotchas to keep on the radar

- **Webhook raw body.** App Router route handlers must read `await req.text()` (not parsed JSON) for signature verification.
- **Idempotency.** Always check the unique session ID before writing — Stripe retries.
- **Never trust client prices.** Re-read from Postgres at session creation. The cart snapshot is display-only.
- **Inventory races.** The conditional decrement (`WHERE inventory_qty >= n`) inside a transaction prevents overselling without heavyweight locking.
- **Stripe Tax ≠ tax filing.** Stripe *calculates and collects* the right tax once you set your origin address and register for GST/HST in the dashboard, but **remittance is still your responsibility** (Stripe has a filing partner if you want that later). Make sure your friends understand this is a business obligation, not something the code handles.
- **Neon cold starts.** Scale-to-zero means the first query after idle has a little latency. At this traffic it's negligible, and ISR means most page views skip the DB entirely — but don't be alarmed by it in testing.
- **Vercel Hobby is non-commercial.** Confirmed: a revenue-generating store needs Pro. Don't ship on Hobby.

---

## Portfolio framing

Two of these decisions are worth an explicit paragraph in your README, because the *reasoning* is the senior signal:

- **Hosted Checkout + guest checkout** — chosen to minimize PCI surface and maintenance for a low-volume store; the tradeoff (less checkout-UI control) was the right call given the business context.
- **Postgres + Drizzle over a managed BaaS** — chosen to own the relational data model and demonstrate SQL schema design (snapshots, conditional inventory updates, foreign-key delete behavior).
- **End-to-end type safety without tRPC** — RSC props and Server Actions already carry types across the server/client boundary, so a schema-derived Zod layer (`drizzle-zod`) closes the *runtime* gaps instead of bolting on an RPC framework the App Router doesn't need. Recognizing where the boundaries actually were is the signal.

Showing you know what *not* to build reads as more experienced than showing you can build everything.
