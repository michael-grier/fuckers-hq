import type { Route } from "next";
import Link from "next/link";

const policyLinks: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/contact" as Route, label: "Contact" },
  { href: "/shipping" as Route, label: "Shipping & Delivery" },
  { href: "/returns" as Route, label: "Returns & Refunds" },
  { href: "/privacy" as Route, label: "Privacy" },
  { href: "/terms" as Route, label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-neutral-950 text-white">
      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="font-bold font-grotesk text-xl tracking-tight">
            Fuckers <span className="text-accent">Skateboards</span>
          </p>
          <p className="text-sm text-white/60">
            Guest checkout, Stripe-hosted payments, and admin-managed inventory.
          </p>
        </div>
        <nav aria-label="Policies and contact">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
            {policyLinks.map(({ href, label }) => (
              <li key={href}>
                <Link
                  className="rounded-md text-white/70 outline-none transition hover:text-white hover:underline focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
                  href={href}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
