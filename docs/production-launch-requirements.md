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

## 4. Email

**Brand provides:**

- The from-address for order confirmation emails (`EMAIL_FROM`)
- A customer support address (`SUPPORT_EMAIL`)
- **DNS access to the domain** — not just proof of purchase

DNS access is a hard blocker, not a convenience. Resend requires SPF and DKIM records published on
the brand's domain before order confirmation emails will deliver reliably. The same access is needed
to point the domain at Vercel.

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
- Social share / Open Graph image. No `openGraph` metadata is configured yet, so links shared to
  social platforms currently render without a preview image.
- Confirmation of the brand accent colour and typeface. The site currently uses Space Grotesk with a
  gold accent sampled from the flame logo.

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
- **Domain name** — purchased, with DNS access (see Email above).
- **Service account ownership** — decide who owns and pays for Vercel, Neon, Cloudflare R2, Resend,
  Sentry, and the domain registrar. Recommend these live under the brand's email with the developer
  added as a collaborator. It avoids a painful ownership handoff later.

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
