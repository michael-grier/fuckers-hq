import { Instagram, Youtube } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";

import { PolicyPage, PolicyParagraph, PolicySection } from "@/components/shop/policy-page";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach Fuckers Skateboards about an order, a return, or anything else.",
};

// Duplicated with SiteFooter's social links; consolidate into one module once the
// footer social-link work lands.
const socialLinks: ReadonlyArray<{ href: string; label: string; Icon: typeof Instagram }> = [
  { href: "https://www.instagram.com/fuckers.hq/", label: "Instagram", Icon: Instagram },
  { href: "https://www.youtube.com/@f.ckers_skateboards", label: "YouTube", Icon: Youtube },
];

export default function ContactPage() {
  const supportEmail = env.SUPPORT_EMAIL;

  return (
    <PolicyPage
      description="Questions about an order, a return, or anything else — here's how to reach us."
      title="Get in touch."
    >
      <PolicySection heading="Email us">
        <PolicyParagraph>
          The fastest way to reach us is{" "}
          <a
            className="font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:decoration-4"
            href={`mailto:${supportEmail}`}
          >
            {supportEmail}
          </a>
          . We reply within 5 business days.
        </PolicyParagraph>
        <PolicyParagraph>
          If your message is about an existing order, include your order number — it is in your
          confirmation email. That lets us find your order without a round trip.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Returns and order problems">
        <PolicyParagraph>
          If an item arrived damaged, incorrect, or you want to send something back, start with our{" "}
          <Link
            className="font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:decoration-4"
            href={"/returns" as Route}
          >
            returns &amp; refunds policy
          </Link>
          . It covers what can be returned and how to start the process.
        </PolicyParagraph>
        <PolicyParagraph>
          For shipping timelines and tracking, see{" "}
          <Link
            className="font-semibold text-foreground underline decoration-accent decoration-2 underline-offset-4 hover:decoration-4"
            href={"/shipping" as Route}
          >
            shipping &amp; delivery
          </Link>
          .
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Stockists and wholesale">
        <PolicyParagraph>
          Want to carry our boards in your shop? Email {supportEmail} with your shop name and
          location.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Find us online">
        <PolicyParagraph>
          We are most active on Instagram — drops and edits get posted there first.
        </PolicyParagraph>
        <ul className="flex flex-wrap gap-3">
          {socialLinks.map(({ href, label, Icon }) => (
            <li key={href}>
              <a
                className="flex items-center gap-2 rounded-full border px-4 py-2 font-semibold text-sm outline-none transition hover:bg-muted focus-visible:ring-2 focus-visible:ring-accent"
                href={href}
                rel="noreferrer"
                target="_blank"
              >
                <Icon aria-hidden="true" className="size-4" />
                {label}
              </a>
            </li>
          ))}
        </ul>
      </PolicySection>
    </PolicyPage>
  );
}
