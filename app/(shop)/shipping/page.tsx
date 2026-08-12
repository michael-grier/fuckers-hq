import type { Metadata } from "next";

import { PolicyDraftNotice } from "@/components/shop/policy-draft-notice";
import {
  PolicyList,
  PolicyPage,
  PolicyParagraph,
  PolicySection,
} from "@/components/shop/policy-page";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Shipping & Delivery",
  description: "Where Fuckers Skateboards ships, what it costs, and how long it takes.",
};

export default function ShippingPage() {
  return (
    <PolicyPage
      description="Where we ship, what it costs, and when to expect your order."
      effectiveDate="August 12, 2026"
      title="Shipping & delivery."
    >
      <PolicyDraftNotice />

      <PolicySection heading="Where we ship">
        <PolicyParagraph>
          We currently ship within Canada only. Shippable countries are enforced at checkout, so you
          will see an error if your address is outside our delivery area.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Shipping costs">
        <PolicyParagraph>Shipping is a flat $20 CAD per order.</PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Processing time">
        <PolicyParagraph>
          We pack and ship orders within 3-5 business days. We do not ship on weekends or holidays.
          During product drops, processing may take longer — we will note this on the site when it
          applies.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Delivery estimates">
        <PolicyParagraph>Once shipped, delivery typically takes:</PolicyParagraph>
        <PolicyList>
          <li>Within Canada: 3-7 business days</li>
        </PolicyList>
        <PolicyParagraph>
          These are estimates from the carrier, not guarantees. Weather, customs, and carrier delays
          are outside our control.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Tracking">
        <PolicyParagraph>
          When your order ships we email you a shipping notice with the carrier and tracking number,
          linked to the carrier's tracking page where one is available. If you have not received
          that email within 5 business days of ordering, check your spam folder and then contact us.
        </PolicyParagraph>
      </PolicySection>

      {/* Gated on the same server flag checkout uses, so a store with delivery off never
          advertises it here; see docs/production-launch-requirements.md §2. */}
      {env.DELIVERY_ENABLED ? (
        <PolicySection heading="Local delivery">
          <PolicyParagraph>
            Orders within Rockyview County, Alberta are eligible for local delivery. We will contact
            you to schedule a time and place. Delivery orders are not shipped and are not charged
            shipping.
          </PolicyParagraph>
        </PolicySection>
      ) : null}

      <PolicySection heading="Incorrect addresses and undeliverable packages">
        <PolicyParagraph>
          Please double-check your shipping address at checkout. We ship to the address as entered.
          If a package is returned to us as undeliverable, we will refund the order minus shipping
          costs, or reship it once you cover shipping again.
        </PolicyParagraph>
        <PolicyParagraph>
          We are not responsible for packages marked delivered by the carrier but reported missing.
          If this happens, file a claim with the carrier and contact us so we can help where
          possible.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Lost or delayed orders">
        <PolicyParagraph>
          If tracking has not updated in 10 business days, email
          {env.SUPPORT_EMAIL} with your order number and we will investigate with the carrier.
        </PolicyParagraph>
      </PolicySection>
    </PolicyPage>
  );
}
