# Fuckers HQ

A custom ecommerce site for Fuckers Skateboards, an independent skate brand in Calgary. It pairs
a storefront with an admin dashboard for managing products, stock, orders, shipping, and local
delivery. This repository is public as part of my developer portfolio.

## What it does

Customers can browse and filter the catalog, select product variants, manage a persistent cart,
and check out through Stripe without creating an account. The site also includes brand content,
video, and store policies.

The admin dashboard handles product images, pricing, inventory, order fulfillment, shipment
tracking, and local-delivery address review. Customers receive transactional emails for payments,
refunds, and fulfillment updates.

## Engineering decisions

- **Protect inventory during checkout.** Prices and stock are resolved on the server, with
  inventory reservations to handle competing purchases. Payment processing tolerates duplicate
  events and preserves paid orders when inventory needs operator attention.
- **Keep order history reliable.** Orders retain the purchased names, prices, and quantities even
  when the catalog changes. Email delivery retries independently, so a provider failure cannot
  undo a paid order.
- **Separate authentication from authorization.** Clerk handles sign-in; server-side checks
  independently restrict access to store administration.

## Stack

Next.js 16, React 19, TypeScript, and Tailwind CSS; Neon Postgres with Drizzle ORM; Clerk, Stripe
Checkout, Cloudflare R2, Resend, and Sentry. Bun runs the local tooling, with Biome, Bun tests,
and Playwright supporting automated checks. The app is hosted on Vercel.

## Explore the code

- [Storefront](app/%28shop%29/) and [admin dashboard](app/admin/)
- [Checkout](lib/checkout/), [order processing](lib/orders/), and [database schema](lib/db/schema.ts)
- [Browser tests](e2e/) and [component and service tests](tests/)
