# Production launch requirements

Everything the brand needs to provide before this project can move from the demo (placeholder
content, Stripe sandbox) to a real production launch.

The demo runs entirely on non-live resources. See [demo-deployment.md](./demo-deployment.md) for how
that environment is configured. This document covers what changes for production.

Requirements are grouped by who owns them: **Brand** items are things the owners must supply or
decide, **Build** items are work that follows once the brand item arrives.

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

**Decisions required:**

- **Who is the Stripe account owner.** On an individual account this person is personally
  responsible for chargebacks, refunds, disputes, and income tax on the revenue. It is their SIN,
  their bank account, and their credit. Choose deliberately rather than by whoever fills out the form
  first, and write down what the group agrees to regarding revenue, expenses, and what happens if
  someone leaves. A shared document is sufficient.
- **Where payouts land.** If payouts go to a personal chequing account in the owner's own name, no
  filing is needed. If they want a business bank account under the "Fuckers Skateboards" name,
  Alberta banks will require a **trade name registration** (declaration of trade name) first —
  inexpensive and quick, but a prerequisite rather than an afterthought.
- Confirmation that all prices are CAD. The admin variant form is currently labelled "Price (CAD)".

### GST/HST and Stripe Tax

Canada's small supplier threshold is $30,000 CAD in revenue across four consecutive calendar
quarters. Below that, GST/HST registration is not required, and an apartment-scale operation is very
likely under it.

`STRIPE_TAX_ENABLED` therefore stays `false` for launch. Collecting tax the brand is not registered
to remit is a worse problem than not collecting it. The schema default is `false` so that a missing
variable in Vercel cannot silently enable collection; enabling it requires both an explicit `true`
and registered tax jurisdictions inside Stripe.

### Verify early, not late

- **Complete Stripe onboarding well before launch week.** Stripe reviews account and business names,
  and the brand name is profane. It is not expected to be blocked, but leave time to respond if
  Stripe asks questions.
- **Consider a softer statement descriptor.** This is what appears on customer credit card
  statements. Something like `FCKRS SKATE` reads better on a shared household statement, and
  surprising statement lines are a real source of chargebacks. The brand's call, but raise it.
- **Calgary Home Occupation permit.** Running a business from a residence may require one. This is
  between the brand and the city and is not a deploy blocker, but they should know it exists.

> The tax and registration details above are the general shape only, from a developer rather than a
> lawyer or accountant. An hour with an accountant before launch is cheap and worth it.

**Build follow-up:** switch to live Stripe keys, register the live webhook endpoint, and verify the
webhook signing secret in production.

---

## 2. Shipping

**Decisions required:**

- Which countries they ship to. `SHIPPING_ALLOWED_COUNTRIES` currently defaults to `CA,US`.
- Flat shipping rate in cents (`SHIPPING_STANDARD_RATE_CENTS`).
- Free-shipping threshold, if any, in cents (`SHIPPING_FREE_THRESHOLD_CENTS`).
- Who physically packs and ships orders.
- Which carrier they use, and whether tracking numbers need to reach the customer.

---

## 3. Policy and legal pages

None of these pages exist in the app yet. Stripe expects a storefront to publish them, and consumer
protection law effectively requires the refund and contact information.

**Brand provides (copy, or approval of drafts):**

- Refund and return policy
- Shipping and delivery policy
- Privacy policy
- Terms of service
- Contact information for customer inquiries

**Build follow-up:** build the pages and link them from the site footer.

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

**Per product:** name, category (hardgoods / softgoods / accessories), description, status.

**Per variant:** variant name (size or colourway), SKU, price, starting inventory count.

Request this as a spreadsheet. It is usually the slowest item on this list to collect.

Also needed: sizing charts and fit notes for any apparel.

---

## 6. Brand assets

- Logo in vector format (SVG, AI, or EPS), plus a 2048 px transparent PNG fallback
- Light-on-dark and dark-on-light logo variants — the site uses a dark header and footer with a
  white mid-band, so both get used
- Favicon source image (see sizes below). There is currently no favicon in `public/`.
- Social share / Open Graph image (see below)
- Confirmation of the brand accent colour and typeface. The site currently uses Space Grotesk with a
  gold accent sampled from the flame logo.

### Social share / Open Graph image

Open Graph is the set of `<meta>` tags that tell other platforms how to render a preview card when a
link is pasted. It produces the image, title, and description shown when a URL is shared into an
Instagram DM or story, iMessage, Discord, WhatsApp, Slack, Facebook, or X. X uses its own
`twitter:card` tags, which fall back to Open Graph when absent.

With the tags missing, platforms improvise — usually a bare grey box showing the domain. It reads as
broken, and it gets clicked noticeably less.

**Current state: nothing is configured.** `app/layout.tsx` sets `title` and `description` but no
`openGraph` block and no `metadataBase`; there is no `opengraph-image` or `twitter-image` file in
`app/`; and `generateMetadata` in `app/(shop)/products/[slug]/page.tsx` sets only `title` and
`description`. Every shared link currently unfurls bare.

This is worth prioritising above most polish items. A small skate brand's distribution *is* link
sharing — drops get posted to stories and dropped into group chats and Discord servers, so the
preview card is often a customer's first look at the site, competing against designed content in the
same feed. It is roughly an hour of work and it affects every share permanently.

#### Image specification

**1200 × 630 px (1.91:1)** — accepted by every major platform.

- **Format:** PNG or JPEG. Not WebP; several scrapers still do not handle it.
- **File size:** under 1 MB as a practical target. Facebook's hard cap is 8 MB, but large files time
  out during scraping.
- **Text must be large.** These render small, sometimes 300 px wide in a chat list. Logo plus three
  or four words maximum; body-copy sizes are unreadable.
- **Keep content away from the edges.** Platforms crop inconsistently — some show the full 1.91:1,
  others crop toward square. Assume the outer ~10% may be lost.

#### Two levels of implementation

1. **Static site-wide image.** Logo and wordmark on the brand's dark charcoal with the gold accent.
   Next.js picks this up automatically at `app/opengraph-image.png` with no code required, covering
   the homepage, crew, videos, and any page without its own.
2. **Per-product images**, so sharing a specific deck shows that deck. The cheap version points Open
   Graph at the product's existing primary R2 photo from the existing `generateMetadata`. Product
   photos are square, so platforms will crop or letterbox them into 1.91:1 — acceptable, and far
   better than nothing. The composed version generates a 1200 × 630 card per product at request time
   via `ImageResponse` (product photo on brand background with name and price). Start with the cheap
   version; upgrade if the brand wants it.

#### Required build item: `metadataBase`

Without `metadataBase`, Next.js emits Open Graph image URLs as relative paths, which external
scrapers cannot resolve — the preview silently falls back to nothing. It must be set to the
production origin, wired to `NEXT_PUBLIC_APP_URL` (currently defaulting to `http://localhost:3000`)
once the real domain exists.

This is a footgun: everything looks correct locally and produces no preview in production. Add
`og:site_name`, `og:type`, `twitter:card: summary_large_image`, and alt text on the image alongside
it.

#### Testing caveat

Open Graph previews cannot be tested from `localhost` — scrapers need a publicly reachable URL, so
this is verified on a Vercel preview or production deploy using Facebook's Sharing Debugger and X's
Card Validator.

Platforms cache aggressively and some cache indefinitely. If a link is shared before the tags are
correct, the bad preview can persist for a long time; Facebook allows a forced re-scrape, iMessage
effectively does not. **Get this right before the launch announcement, not after.**

#### Questions to ask the brand

> Either send a designed 1200 × 630 social share image, or send the logo files plus a yes/no on us
> composing one from the logo on the brand's dark background. Also: do you want a tagline on it, or
> logo only?

Logo only on a solid brand background is perfectly acceptable and is what most small brands ship.

---

## 7. Placeholder content still in the app

- **Hero headline and subhead** — currently "Buy our stuff, we're broke." This is a deliberate voice
  choice and needs explicit sign-off.
- **Crew page** — currently an empty-state placeholder. Needs, per person: name, role, photo, short
  bio, and social handle.
- **Videos page** — currently an empty-state placeholder. Needs the list of videos with titles and
  YouTube or Vimeo URLs.
- **SEO metadata** — site title and meta description.
- **Footer social links** — confirm the existing Instagram and YouTube accounts are correct, and
  whether TikTok or Facebook should be added.

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

### Vercel: hosting under the developer's existing Pro team

The developer already holds a Vercel Pro account, so the commercial-use requirement is already
satisfied and the brand does not need to buy their own plan to launch.

Two viable arrangements:

1. **Host under the developer's existing Pro team.** Nothing new to buy. The brand has no direct
   Vercel access, which is acceptable provided it is documented and the project is transferable.
   Adding brand members to that team costs an additional seat each.
2. **The brand creates their own Pro team** and the project is transferred to it. Vercel supports
   transferring projects between teams, so this is not a one-way door and can be deferred until the
   brand wants direct control.

Option 1 is the sensible default for launch. Record that the project can be transferred on request so
it does not become an unspoken dependency.

### R2 needs a custom domain in production

Cloudflare's `r2.dev` public bucket URL is rate-limited and is not recommended for production
traffic. Production should serve images from a custom domain on the bucket — for example
`images.theirdomain.com` — which becomes `R2_PUBLIC_URL`.

This is another consumer of DNS access. The application requires no other change: `img-src` in the
middleware CSP is `https:` and product images are `unoptimized`, so there are no `remotePatterns` to
update.

### Recommended ownership

**The brand should own the domain, Stripe, Neon, R2, and Resend**, with the developer added as a
collaborator on each.

The reasoning is continuity, and it protects both parties. If the working relationship ends, for any
reason, the brand keeps a functioning store and the developer keeps no open obligations. The
developer also is not carrying the brand's infrastructure costs personally, and is not a single point
of failure while unreachable. The painful version of this conversation happens years later when
nobody remembers who controls the DNS.

**Sentry may stay under the developer's account** — it is developer tooling rather than
customer-facing infrastructure, and the brand will never sign into it.

**Vercel** follows the arrangement chosen above.

### Practical middle ground

A small group running this from an apartment may not want to create and manage six accounts. A
reasonable compromise: the brand creates the accounts that hold money or identity — **Stripe, the
domain, and Vercel if they choose option 2** — and the developer manages Neon, R2, Resend, and Sentry
with a written note that each can be transferred on request.

What matters is that this is decided explicitly and written down, rather than defaulting to whoever
happened to have a browser open.

**Sequencing note:** have the brand create these accounts using an email the whole group can access,
not one person's personal Gmail. A shared `hello@theirdomain.com` is ideal — which requires the
domain first. **Domain purchase is the head of the dependency chain for nearly everything on this
list.**

---

## 9. Scope questions to settle before launch

Worth raising early so they are not assumed to be included:

- Discount and promo codes
- Newsletter signup
- Gift cards
- Order tracking numbers emailed to customers
- Web analytics

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
