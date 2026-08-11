import type { Metadata } from "next";

import { PolicyDraftNotice } from "@/components/shop/policy-draft-notice";
import {
  PolicyList,
  PolicyPage,
  PolicyParagraph,
  PolicySection,
} from "@/components/shop/policy-page";

export const metadata: Metadata = {
  title: "Shipping & Delivery",
  description: "Where Fuckers Skateboards ships, what it costs, and how long it takes.",
};

export default function ShippingPage() {
  return (
    <PolicyPage
      description="Where we ship, what it costs, and when to expect your order."
      effectiveDate="[EFFECTIVE DATE]"
      title="Shipping & delivery."
    >
      <PolicyDraftNotice />

      <PolicySection heading="Where we ship">
        <PolicyParagraph>
          We currently ship to [SHIPPING COUNTRIES, e.g. Canada and the United States]. Shippable
          countries are enforced at checkout, so you will see an error if your address is outside
          our delivery area.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Shipping costs">
        <PolicyParagraph>
          Shipping is a flat [SHIPPING RATE] per order. Orders over [FREE SHIPPING THRESHOLD] ship
          free. The exact shipping charge is shown at checkout before you pay.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Processing time">
        <PolicyParagraph>
          We pack and ship orders within [PROCESSING TIME, e.g. 1-3] business days. We do not ship
          on weekends or holidays. During product drops, processing may take longer — we will note
          this on the site when it applies.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Delivery estimates">
        <PolicyParagraph>Once shipped, delivery typically takes:</PolicyParagraph>
        <PolicyList>
          <li>[DOMESTIC REGION, e.g. Within Canada]: [ESTIMATE, e.g. 3-7] business days</li>
          <li>[SECONDARY REGION, e.g. United States]: [ESTIMATE, e.g. 5-12] business days</li>
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
          that email within [TRACKING EMAIL WINDOW, e.g. 5] business days of ordering, check your
          spam folder and then contact us.
        </PolicyParagraph>
      </PolicySection>

      {/* Only shown to customers when PICKUP_ENABLED is true; see docs/production-launch-requirements.md §2. */}
      <PolicySection heading="Local pickup">
        <PolicyParagraph>
          [LOCAL PICKUP: delete this section if you are not offering pickup. If you are, state the
          pickup location, the hours it is available, and what a customer should bring or say when
          collecting. Pickup orders are not shipped and are not charged shipping.]
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Customs, duties, and import taxes">
        <PolicyParagraph>
          International orders may be subject to customs duties or import taxes charged by the
          destination country. These are the recipient's responsibility and are not included in the
          price you pay us. We cannot predict or refund these charges.
        </PolicyParagraph>
      </PolicySection>

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
          If tracking has not updated in [STALLED TRACKING WINDOW, e.g. 10] business days, email
          [SUPPORT EMAIL] with your order number and we will investigate with the carrier.
        </PolicyParagraph>
      </PolicySection>
    </PolicyPage>
  );
}
