# Production launch requirements

Everything the brand needs to provide before this project can move from the demo (placeholder
content, Stripe sandbox) to a real production launch.

The demo runs entirely on non-live resources. See [demo-deployment.md](./demo-deployment.md) for how
that environment is configured. This document covers what changes for production.

Requirements are grouped by who owns them: **Brand** items are things the owners must supply or
decide, **Build** items are work that follows once the brand item arrives.

## Document status

**The code references changed for issue #104 were verified against `main` at commit `15ba59a`.**
Statements about what does and does not exist in the codebase go stale quickly. Several were already
wrong within two weeks of first being written. Re-verify other "current state" claims before acting
on them.

### Build status at a glance

| Capability | Status | Where |
| --- | --- | --- |
| Open Graph / social share metadata | **Built** | `app/layout.tsx`, `app/opengraph-image.png`, per-product in `app/(shop)/products/[slug]/page.tsx` |
| Favicon and app icons | **Built** | `app/favicon.ico`, `app/icon.png`, `app/apple-icon.png` |
| Shipment tracking emails | **Built** | `lib/email/order-shipped.tsx`, `lib/orders/shipping-carriers.ts` |
| Local delivery fulfilment | **Built, disabled by default** | `lib/checkout/delivery.ts`, `DELIVERY_ENABLED` |
| Policy and contact pages | **Built; policies published August 31, 2026** | `app/(shop)/{returns,shipping,privacy,terms,contact}` |
| Product subcategory taxonomy | **Built, required on every product** | `lib/catalog/categories.ts`, migration `0011` |
| Crew page content | **Not built** — empty state | `app/(shop)/crew/page.tsx` |
| Videos page content | **Not built** — empty state | `app/(shop)/videos/page.tsx` |
| Discount codes, newsletter, gift cards, analytics | **Not built**, not scoped | — |

The domain, DNS, email, Clerk, and Stripe production resources now exist. The remaining blockers are
overwhelming *brand inputs* and launch verification, not engineering work.

---

## 1. Stripe and business setup

A bank account alone does not activate a Stripe account. Stripe requires identity verification
before it will accept live payments.

**Incorporation is not required.** Stripe Canada supports an **individual / sole proprietor** account
type, which is the expected path for a small unincorporated group. One person becomes the account
owner.

**Brand provides:**

- Legal name, home address, and date of birth of the account owner
- SIN for the account owner (Stripe requires this for Canadian individual accounts)
- Government-issued photo ID for the account owner
- Bank account details for payouts
- Statement descriptor — the text customers see on their credit card statement (22 character limit)
- GST/HST number, only if they are registered

**Confirmed operating setup:**

- **Legal operator and Stripe owner.** Tristan Hawkins, operating as a sole proprietor under his own
  legal name. The terms and privacy pages identify him as the store operator.
- **Payout account.** Tristan's personal account in his legal name. A business bank account is not a
  launch dependency. The payout choice does not decide whether the public storefront name must be
  registered as a trade name.
- **Income reporting.** Tristan has operated the business for several years and reports its income on
  his personal tax return. CRA directs sole proprietors to report business income and expenses using
  [Form T2125](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses.html).
- **Currency.** All storefront prices are CAD. The admin variant form is labelled "Price (CAD)".

### Alberta trade-name registration

Alberta defines a trade name as a name an individual uses to do business under something other than
their personal name. It also describes a business name as a name used to represent the business to
the public. The storefront is operated legally by Tristan but presents "Fuckers Skateboards" as its
public name, so the payout account cannot be used as the test for registration.

No registry agent, lawyer, or accountant has confirmed whether this specific presentation requires a
Declaration of Trade Name. Treat registration as a pre-launch requirement unless an Alberta registry
agent or legal adviser confirms that operating and contracting in Tristan's name makes it unnecessary.
See [Alberta's business-name guidance](https://www.alberta.ca/register-business-name.aspx).

### GST/HST and Stripe Tax

Launch shipping is Canada-only. Tristan expects his total taxable supplies to remain well below the
federal $30,000 CAD small-supplier threshold, and no tax registration was reported. The threshold
calculation covers worldwide taxable supplies from all of the person's businesses and associates,
not only revenue from this storefront. CRA applies it both to a single calendar quarter and across
four consecutive calendar quarters. See
[CRA's registration rules](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/when-register-charge.html).

`STRIPE_TAX_ENABLED` stays `false` for launch. This is a fail-closed operating decision, not a
completed Canada-wide tax review. Collecting tax without the matching registration creates a
remittance obligation the business is not prepared to meet. The schema default is `false` so that a
missing Vercel variable cannot silently enable collection.

No accountant has reviewed the provincial obligations. The federal $30,000 threshold cannot be
applied to every provincial sales tax. For example, certain Canadian sellers outside British
Columbia must register after exceeding $10,000 in B.C. revenue in the previous 12 months or their
reasonable estimate for the next 12 months. See
[B.C.'s PST registration guidance](https://www2.gov.bc.ca/assets/gov/taxes/sales-taxes/publications/pst-001-registering-to-collect-pst.pdf).

Before relying on the launch setting long-term, the brand must record taxable supplies by quarter and
sales by province, then have an accountant review each province served. Where collection becomes
required, complete the registration and add the matching jurisdiction in Stripe Tax before changing
`STRIPE_TAX_ENABLED` to `true`.

### Verify early, not late

- **Complete Stripe onboarding well before launch week.** Stripe reviews account and business names,
  and the brand name is profane. It is not expected to be blocked, but leave time to respond if
  Stripe asks questions.
- **Consider a softer statement descriptor.** This is what appears on customer credit card
  statements. Something like `FCKRS SKATE` reads better on a shared household statement, and
  surprising statement lines are a real source of chargebacks. The brand's call, but raise it.
- **Calgary Home Occupation permit.** Running a business from a residence may require one. This is
  between the brand and the city and is not a deploy blocker, but they should know it exists.

> The tax and registration details above record the current operating decisions and the remaining
> professional review. They are not legal or accounting advice.

**Production status.** Live Stripe keys and the live webhook are configured. A live charge and refund
verified the payment lifecycle; `STRIPE_TAX_ENABLED` remains `false`.

---

## 2. Shipping and fulfilment

**Decisions required:**

- Which countries they ship to. `SHIPPING_ALLOWED_COUNTRIES` defaults to `CA`, matching the shipping policy page. Widening it means updating that page in the same change.
- Profile-specific shipping rates in the database (`shipping_rates`).
- Free-shipping threshold, if any, in cents (`SHIPPING_FREE_THRESHOLD_CENTS`).
- Who physically packs and ships orders.
- Processing time before dispatch, and realistic delivery estimates per region. These feed the
  bracketed placeholders on `/shipping`.

### Tracking emails are already built

Admins record a carrier and tracking number when marking an order shipped, and the customer is
emailed automatically. New shipments use Canada Post and reject tracking numbers that are not a
16-digit domestic PIN or a checksum-valid 13-character S10 identifier. Historical carrier values
remain readable on older orders. Adding another carrier requires a format validator and tracking
URL; a new enum value also requires a Postgres migration.

### Local delivery is built but disabled

Local delivery replaced local pickup (issue #106): because the business is headquartered in the
owner's residence, they deliver local orders rather than publish a collection address. Delivery is
offered only when `DELIVERY_ENABLED` is `true` **and** `DELIVERY_AREA_NAME` is set, so a
half-configured deploy cannot offer delivery without saying where it applies.

Checkout collects a Canada-only delivery address, charges nothing for delivery, and tells the
customer the operator will contact them to arrange the drop-off. Stripe cannot restrict an address
below country level, so the operator verifies each address is within 40 km of Calgary city centre
when scheduling, and refunds out-of-area orders.

| Variable | Content |
| --- | --- |
| `DELIVERY_AREA_NAME` | Public name of the service area, e.g. `40 km of Calgary city centre` |
| `DELIVERY_INSTRUCTIONS` | Optional note shown with the delivery option at checkout |

If the brand declines, leave `DELIVERY_ENABLED=false` and the option never appears.

---

## 3. Policy and legal pages

**The pages are built, linked from the footer, and published with an effective date of August 31,
2026.** The shipping, return, and tax wording reflects the launch configuration recorded in this
document.

| Page | Route |
| --- | --- |
| Returns & Refunds | `/returns` |
| Shipping & Delivery | `/shipping` |
| Privacy Policy | `/privacy` |
| Terms of Service | `/terms` |
| Contact | `/contact` |

### Publication status

The brand approved the operating details used by the policy pages. The draft notice and the final
bracketed placeholder were removed before publication. Search the policy routes for `[` when editing
them so a new placeholder cannot ship by accident.

### Legal review

The policies reflect how this store operates, but a lawyer has not reviewed them. The brand should
have someone qualified read the assumption-of-risk and limitation-of-liability clauses in `/terms`.
Those clauses matter if someone is injured while using a product from the store.

### The privacy policy describes this codebase specifically

It is not boilerplate. It states that card data never reaches our servers (Stripe hosted Checkout),
that orders store email and `shippingAddress`, that the cart lives in browser `localStorage`, and
that there are no analytics or advertising trackers — which is true today. It names all seven
service providers.

**If the stack changes, this page must change with it.** Adding analytics, a newsletter integration,
or any third-party script makes the current wording false.

---

## 4. Email and DNS

**Brand provides:**

- The from-address for order confirmation emails (`EMAIL_FROM`)
- A customer support address (`SUPPORT_EMAIL`)
- **DNS access to the domain** — not just proof of purchase

### What "DNS access" means

DNS maps a domain name to servers. Buying a domain gets the *name*; pointing it somewhere and
proving control of it happens through DNS records, edited either at the registrar or wherever the
domain's nameservers are delegated.

Owning a domain and being able to configure it are different things. Common blockers: a friend bought
it and still holds the login, it sits inside a Wix or Squarespace subscription exposing only a
limited DNS panel, or the account has 2FA tied to a phone nobody has anymore. "We bought the domain"
does not answer the question.

### Three parts of this stack need DNS records

| Service | Records | Purpose |
| --- | --- | --- |
| Vercel | `A` on the apex plus `CNAME` on `www`, or nameserver delegation | Serving the site |
| Resend | `TXT` for SPF and DKIM, ideally DMARC | Order confirmation email delivery |
| Clerk | `CNAME` records for the frontend API and accounts portal | Admin sign-in on a production instance |

Clerk is easy to overlook. The app uses `clerkMiddleware` with Clerk's hosted sign-in — there are no
custom sign-in pages. Development keys work on `localhost` and preview URLs but will not carry a real
production deployment, and promoting a Clerk instance to production requires those DNS records.

### Why email delivery is the sharp edge

Without valid SPF and DKIM, Gmail and Outlook junk or silently reject order confirmations. The
failure mode is invisible from inside the app: Stripe charges the card, the order commits, the app
records the confirmation as sent, and the customer receives nothing. They then ask whether their
money disappeared, or skip that and file a chargeback. Nothing in the logs looks broken.

This cannot be worked around in code, which is why DNS access is a launch blocker rather than a
nice-to-have.

### Preferred ways to obtain access, best first

1. **The brand owns the registrar account and adds the developer as a delegate user.** Most
   registrars support this. The asset stays theirs, access is scoped, no password sharing.
2. **The brand delegates nameservers to Cloudflare or Vercel** and grants access to that zone. They
   keep the registrar; the developer manages records.
3. **The brand adds records themselves from exact values supplied by the developer.** Slower, usually
   two or three rounds of correcting pasted values, but they retain full control.
4. **Avoid: the brand emails registrar credentials.** This muddles ownership and puts their
   credentials in the developer's hands.

### Two technical gotchas to pre-empt

- **If the domain already handles email** (Google Workspace, or a registrar mailbox), do not clobber
  the existing `MX` or `SPF` records. A domain may have only **one** SPF `TXT` record — adding a
  second silently breaks authentication for both senders. Resend's value must be merged into the
  existing record, not appended as a new one.
- **Prefer sending from a subdomain**, e.g. `send.theirdomain.com` rather than the apex.
  Transactional email then has its own SPF and DKIM, isolated from their human email, so a
  reputation problem on one side cannot damage the other. Customers still see the brand in the
  from-address. This is the recommended default.

**Scheduling note:** if the domain is moving between registrars, do it well before launch. Transfers
hit a 60-day lock after registration or a prior transfer, and DNS changes can take up to 48 hours to
propagate.

### Questions to ask the brand

> Who owns the account where the domain was purchased, and can that person log in right now? Is the
> domain currently used for email? If yes, which provider? Can you add me as a delegate user on the
> registrar account, or would you prefer to paste in DNS records I send you?

Those three answers determine whether this is a ten-minute task or a two-week one.

---

## 5. Product catalog data

Photos and descriptions are not sufficient on their own. The admin forms require structured data for
every product and every purchasable variant.

**Per product:** name, slug, category, **subcategory**, description, status.

**Per variant:** variant name (size or colourway), SKU, price, starting inventory count.

Request this as a spreadsheet. It is usually the slowest item on this list to collect.

Also needed: sizing charts and fit notes for any apparel.

### Subcategory is mandatory and comes from a fixed list

Every product must carry a subcategory, and each subcategory belongs to exactly one parent category.
The list is a closed taxonomy defined in `lib/catalog/categories.ts` and mirrored by a database check
constraint (migration `0011`), so **schema and contract must change together** — adding a value is a
code change plus a migration, not a data entry choice.

| Category | Valid subcategories |
| --- | --- |
| Hardgoods | Decks, Trucks, Wheels, Bearings, Griptape, Hardware |
| Softgoods | T-Shirts, Hoodies, Jackets, Pants, Hats, Socks |
| Accessories | Stickers, Patches, Keychains, Buttons, Papers |

Give the brand this table when requesting the catalogue spreadsheet, and add a subcategory column.
If they sell something that does not fit — grip cleaners, bushings, wax, bags — that is a code and
migration change, so surface it **before** the spreadsheet comes back rather than after.

---

## 6. Brand assets

- Logo in vector format (SVG, AI, or EPS), plus a 2048 px transparent PNG fallback
- Light-on-dark and dark-on-light logo variants — the site uses a dark header and footer with a
  white mid-band, so both get used
- Confirmation of the brand accent colour and typeface. The site currently uses Space Grotesk with a
  gold accent sampled from the flame logo.

Icons and the share image are **already built** from the existing flame logo (see below). The brand
only needs to supply replacements if they want different artwork.

### Icons and social share image — built

| Asset | File | Source |
| --- | --- | --- |
| Favicon | `app/favicon.ico` | Derived from the flame logo |
| App icon | `app/icon.png` | Derived from the flame logo |
| Apple touch icon | `app/apple-icon.png` | Derived from the flame logo |
| Share image | `app/opengraph-image.png` + `app/opengraph-image.alt.txt` | Composed from brand assets |
| In-app logo | `public/logo.svg`, `components/brand-logo.tsx` | Used in the nav and footer |

Open Graph metadata is wired up in `app/layout.tsx` — `metadataBase` resolves from
`NEXT_PUBLIC_APP_URL`, with `openGraph` and `twitter` blocks — and
`app/(shop)/products/[slug]/page.tsx` sets per-product `openGraph.images` from each product's primary
photo. Coverage is asserted by `tests/share-image.test.ts`.

**Remaining risk, and it is a real one:** `metadataBase` derives from `NEXT_PUBLIC_APP_URL`, which
defaults to `http://localhost:3000`. If that variable is not set to the real origin in Vercel
production, every share preview silently breaks — scrapers cannot resolve relative image URLs, and
nothing about it looks wrong locally. Verify it explicitly at deploy time.

### If the brand wants to replace the share image

**1200 × 630 px (1.91:1)** — accepted by every major platform.

- **Format:** PNG or JPEG. Not WebP; several scrapers still do not handle it.
- **File size:** under 1 MB as a practical target. Facebook's hard cap is 8 MB, but large files time
  out during scraping.
- **Text must be large.** These render small, sometimes 300 px wide in a chat list. Logo plus three
  or four words maximum; body-copy sizes are unreadable.
- **Keep content away from the edges.** Platforms crop inconsistently — some show the full 1.91:1,
  others crop toward square. Assume the outer ~10% may be lost.

Update `app/opengraph-image.alt.txt` alongside the image so the alt text still describes it.

### Verification and caching

Open Graph previews cannot be tested from `localhost` — scrapers need a publicly reachable URL, so
this is verified on a Vercel preview or production deploy using Facebook's Sharing Debugger and X's
Card Validator.

Platforms cache aggressively and some cache indefinitely. If a link is shared before the tags are
correct, the bad preview can persist for a long time; Facebook allows a forced re-scrape, iMessage
effectively does not. **Confirm the production preview renders before the launch announcement, not
after.**

---

## 7. Placeholder content still in the app

- **Hero headline and subhead** — currently "Fuckers Skateboards" over "We work hard to support the
  Calgary skate community, support us by buying some gear!" Needs sign-off on the wording.
- **Crew page** — still an empty-state placeholder. Needs, per person: name, role, photo, short bio,
  and social handle.
- **Videos page** — still an empty-state placeholder. Needs the list of videos with titles and
  YouTube or Vimeo URLs.
- **SEO metadata** — site title and meta description.
- **Footer social links** — confirm the existing Instagram and YouTube accounts are correct, and
  whether TikTok or Facebook should be added.
- **Images** — the hero and category tiles use real photography, but confirm the brand has the
  rights to every image and is happy to ship them. Product photos still come from the seed data.

### Video hosting recommendation

Recommend YouTube or Vimeo embeds over self-hosting. Self-hosting video on R2 means ongoing
bandwidth cost, no adaptive bitrate, and no built-in player. Embeds are free, faster for the viewer,
and give the brand view analytics. Only self-host if they specifically do not want the site sending
traffic to YouTube.

---

## 8. Accounts and access

- **Admin emails** — each admin must create a Clerk account *before* launch. The `ADMIN_USER_IDS`
  environment variable takes Clerk user IDs, not email addresses, so the accounts have to exist
  first. Sequence this ahead of launch day.
- **Clerk ownership.** Tristan owns the production Clerk account, with the developer added as a
  collaborator. Before launch, Tristan must sign in against the production instance and confirm that
  `/admin` loads for his production user ID.
- **Domain name** — purchased, with DNS access. See [Email and DNS](#4-email-and-dns), which is the
  most common cause of launch delay on this list.

### New resources are required regardless of who owns the accounts

Production must never point at demo resources. This is independent of the account ownership decision
below. `docs/demo-deployment.md` carries the authoritative list under "Before real customers use the
site": a dedicated Neon branch or project, live Stripe keys, a Clerk production instance, a
production R2 bucket with least-privilege credentials, a verified Resend sending domain, a production
Sentry project, and fresh Vercel secrets.

### Service tiers and cost

| Service | Tier needed | Notes |
| --- | --- | --- |
| Vercel | Pro (~$20/user/month) | Hobby is restricted to personal, non-commercial use under Vercel's terms. A storefront taking real payments is commercial. |
| Neon | Paid (Launch) | The free tier suspends compute, causing cold starts on first visit, and has a short recovery window. A store wants always-on compute and real backups. |
| Cloudflare R2 | Free tier is sufficient | A small product catalogue will not approach the limits. Requires a card on file. |
| Clerk | Free tier is sufficient | Free to 10k monthly active users; this store has a handful of admins. |
| Resend | Free tier probably sufficient | 3,000/month and **100/day**. Fine at launch, but a drop selling 100+ orders in one day would hit the daily cap. |
| Sentry | Free developer tier is sufficient | Adequate at this scale. |
| Stripe | No subscription | Per-transaction fees only. |
| Domain | ~$15/year | Must be newly purchased in the brand's name. |

**Clerk and Resend both need production instances, and both need DNS records** — Clerk for its
frontend API and accounts portal, Resend for SPF and DKIM. Neither is optional.

### Vercel: initial hosting under the developer's existing Pro team

The developer already holds a Vercel Pro account, so the commercial-use requirement is already
satisfied and the brand does not need to buy its own plan for launch. The agreed launch arrangement
keeps the project there initially, then transfers it to a brand-owned account within roughly two
months of launch.

### Cloudflare DNS and R2

Cloudflare's `r2.dev` public bucket URL is rate-limited and is not recommended for production
traffic. Production should serve images from a custom domain on the bucket — for example
`images.theirdomain.com` — which becomes `R2_PUBLIC_URL`.

Cloudflare now holds both the production DNS zone and R2 storage. The account stays with the
developer for the initial launch and transfers to the brand within roughly two months. The handoff
must preserve the DNS zone, the R2 bucket and custom domain, and least-privilege application
credentials. Losing this account would interrupt the site, transactional email, and Clerk sign-in.

The application requires no other R2 change: `img-src` in the middleware CSP is `https:` and
product images are `unoptimized`, so there are no `remotePatterns` to update.

### Agreed ownership and handoff

| Service | Launch owner | Handoff plan |
| --- | --- | --- |
| Domain registration | Tristan | Developer retains collaborator access only. |
| Stripe | Tristan | Developer may be added as a team member. |
| Clerk | Tristan | Developer is a collaborator. |
| Vercel | Developer | Transfer to the brand within roughly two months of launch. |
| Cloudflare DNS and R2 | Developer | Transfer the account resources and restore developer collaborator access within roughly two months of launch. |
| Resend | Developer | Add Tristan as an Admin of the existing team, rotate the production API key, and remove the developer after test delivery succeeds. |
| Sentry | Developer | No transfer planned; it is developer tooling rather than a customer-facing account. |

Neon's existing ownership arrangement was already settled and does not change as part of this
handoff.

The Vercel, Cloudflare, and Resend transfers are operational work, not a copy-only handoff. Schedule
them one provider at a time, rotate credentials where ownership changes, redeploy, and verify the
affected production path before moving to the next provider.

For Resend, preserve the existing team and its verified sending domain. Invite Tristan as an Admin,
confirm he can manage billing, domains, and API keys, then create a new sending-only API key limited
to the production domain. Replace `RESEND_API_KEY` in Vercel, redeploy, send a test confirmation,
and revoke the old key. The developer can leave the Resend team after those checks pass.

If the brand uses a new Resend team instead, follow Resend's
[domain transfer](https://resend.com/docs/dashboard/domains/manage-domains#transfer-a-domain-between-teams)
or [domain claim](https://resend.com/docs/dashboard/domains/claim) process. Verify ownership when a
claim is required, publish the exact SPF-related and DKIM records shown by the destination team, and
wait for the domain to become verified before changing the application key. Recent owner activity
can block a claim; contact Resend support if that happens. This application does not receive Resend
webhooks, so there is no Resend webhook secret to rotate.

---

## 9. Scope questions to settle before launch

Not built and not scoped. Raise these early so the brand does not assume they are included:

- Discount and promo codes
- Newsletter signup
- Gift cards
- Web analytics
- Customer accounts and order history (checkout is guest-only by design)

**Already built, so do not re-scope these:** tracking-number emails, local delivery, per-product social
share previews, and the policy pages. See the status table at the top.

**Note on analytics:** adding any analytics or advertising script makes the current `/privacy`
wording false, since it states there are none. Treat a privacy-policy update as part of that work
rather than a follow-up.

---

## Image specifications

Dimensions below are derived from the rendered aspect ratios and `sizes` attributes in the
components, doubled to stay sharp on high-DPI screens.

### Landing page hero

**3840 × 2160 (16:9)**, 2560 × 1440 minimum. JPEG or WebP, under 800 KB.

The hero fills the viewport height with `object-cover`, so it crops significantly — tall and narrow
on mobile, wide on desktop. The subject needs breathing room on all sides, because the mobile crop
removes the left and right edges. The component currently compensates with a `28% 25%` focal point.

If they can supply a **separate portrait crop at 1440 × 2160**, the mobile result improves
noticeably and it can be wired up as a distinct source.

### Landing page category tiles

**1600 × 2000 (4:5 portrait)** — one each for hardgoods, softgoods, and accessories.

The aspect ratio is fixed in the layout. All three should be shot consistently — same lighting, same
distance, same treatment — because they sit edge to edge in a single row separated only by a hairline
gap. Inconsistency between them is very visible.

### Product photos

**2000 × 2000 square.** The product is fitted inside the square with `object-contain`, so the subject
should be centred with even margin around it. Use a consistent background across the catalogue —
plain white or a single seamless backdrop.

Supply 3–4 images per product: front, back, a graphic or detail close-up, and one in-context shot.

**Important:** product images are served directly from Cloudflare R2 with Next.js image optimization
disabled (`unoptimized`). Whatever file is uploaded is exactly what the customer downloads. These
must be pre-compressed — target **under 400 KB each**, WebP preferred, or JPEG at roughly quality 80.

> Build follow-up: add a compression step to the admin upload flow, or supply the brand with an
> export preset. The former is preferable before launch.

### Crew / team photos

**1600 × 2000 (4:5 portrait)**, matching the category tiles for visual consistency.

Request consistent framing across the whole team — either waist-up or head-and-shoulders, chosen
once and applied to everyone. Mismatched crops are the single thing that makes a team grid look
unprofessional.

### Logo and icons

| Asset | Specification |
| --- | --- |
| Primary logo | SVG (vector), plus 2048 px wide transparent PNG |
| Logo variants | Light-on-dark and dark-on-light |
| Favicon source | 512 × 512 PNG, transparent, legible at 16 px |
| Social share image | 1200 × 630 |

### General guidance for the brand

- Always send the highest-resolution originals available.
- Do not send screenshots.
- Do not send images downloaded or re-saved from Instagram.
- Do not pre-resize anything. Downscaling is easy; upscaling is not.

---

## Production environment variables

Every variable the app reads is declared in `lib/env.ts` and mirrored in `.env.example`, which is the
source of truth. The ones below need deliberate production values rather than a copied demo value.

| Variable | Production requirement |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | The real origin. Defaults to `http://localhost:3000`; a wrong value silently breaks every social share preview. |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Live keys and a separate live webhook signing secret. |
| `STRIPE_TAX_ENABLED` | Stays `false` unless the brand is tax-registered *and* jurisdictions are configured in Stripe. |
| `DATABASE_URL` | Dedicated production Neon branch or project, never the demo one. |
| `PRODUCTION_NEON_ENDPOINT_ID` | The production branch's non-secret `ep-...` ID; the build rejects a `DATABASE_URL` for any other endpoint. |
| `EMAIL_FROM` / `SUPPORT_EMAIL` | Brand addresses on a Resend-verified domain. `SUPPORT_EMAIL` is baked into the statically rendered `/contact` page at build time, so changing it requires a redeploy. |
| `ADMIN_USER_IDS` | Clerk **user IDs**, not emails. The accounts must exist first. |
| `R2_PUBLIC_URL` | A custom domain on the bucket, not `r2.dev`. |
| `SHIPPING_*` | Countries, flat rate, and free-shipping threshold, per section 2. |
| `DELIVERY_*` | Only if the brand opts into local delivery, per section 2. |
| `CRON_SECRET` | High-entropy value; the schema enforces a minimum length. |
| `SENTRY_*` | A production Sentry project and scoped source-map token. |

---

## Handoff notes

### Where this work lives

This document and the policy and contact pages landed together. Branch state and review status
deliberately live in git and the pull request rather than here, so this document does not go stale
the moment the branch moves.

### What is done on this branch

- This requirements document
- Published `/returns`, `/shipping`, `/privacy`, `/terms`, and `/contact` pages
- Shared policy shell and question disclosures in `components/shop/policy-page.tsx`
- Footer policy navigation in `components/shop/site-footer.tsx`
- `STRIPE_TAX_ENABLED` defaults to `false` in `lib/env.ts` so a missing variable cannot enable tax
  collection

### Known follow-ups, none blocking

- The `socialLinks` array is duplicated between `components/shop/site-footer.tsx` and
  `app/(shop)/contact/page.tsx`. Worth extracting to one module.
- `/contact` is statically prerendered, so `SUPPORT_EMAIL` is captured at build time. The same
  applies to `DELIVERY_ENABLED` on `/shipping`, which gates the local-delivery section: turning delivery
  on or off requires a redeploy for the page to match checkout.
- The `[MAILING ADDRESS]` placeholder on `/contact` is deliberately optional — the brand operates
  from a residence and may not want a public address. Confirm before filling it in.

### Verifying a change here

```bash
bun install   # main adds dependencies frequently; run this after any rebase
bun run lint
bun test
bun run typecheck
bun run build
```

Run the whole gate **after** rebasing, not just after resolving conflicts. A prior rebase produced a
duplicate `const` declaration in `lib/env.ts` that git merged without raising a conflict, because
`main` had independently added an identically named helper. Lint caught it; nothing else would have.
Also avoid piping lint through `tail` in a `&&` chain — the pipeline exit code comes from `tail`, so
failures pass silently.
