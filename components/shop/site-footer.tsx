import { Instagram, Youtube } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";

const socialLinks: ReadonlyArray<{
  href: string;
  label: string;
  Icon: typeof Instagram;
}> = [
  { href: "https://www.instagram.com/fuckers.hq/", label: "Instagram", Icon: Instagram },
  { href: "https://www.youtube.com/@f.ckers_skateboards", label: "YouTube", Icon: Youtube },
];

const policyLinks: ReadonlyArray<{ href: Route; label: string }> = [
  { href: "/contact" as Route, label: "Contact" },
  { href: "/shipping" as Route, label: "Shipping & Delivery" },
  { href: "/returns" as Route, label: "Returns & Refunds" },
  { href: "/privacy" as Route, label: "Privacy" },
  { href: "/terms" as Route, label: "Terms" },
];

export function SiteFooter() {
  return (
    <footer className="border-t bg-surface-chrome text-white">
      <div className="flex flex-col gap-4 px-6 py-4 lg:px-8">
        {/* Logo and social links stay on one row at every width; see the mobile alignment fix. */}
        <div className="flex flex-row items-center justify-between gap-2">
          <BrandLogo />
          <ul aria-label="Social media" className="flex items-center gap-2">
            {socialLinks.map(({ href, label, Icon }) => (
              <li key={href}>
                <a
                  className="grid size-10 place-items-center rounded-md text-white/80 outline-none transition hover:bg-white/10 hover:text-white focus-visible:bg-white/10 focus-visible:text-white focus-visible:ring-2 focus-visible:ring-accent"
                  href={href}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Icon aria-hidden="true" className="size-5" />
                  <span className="sr-only">{label}</span>
                </a>
              </li>
            ))}
          </ul>
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
