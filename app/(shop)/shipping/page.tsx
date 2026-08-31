import type { Metadata } from "next";

import {
  PolicyPage,
  PolicyParagraph,
  PolicyQuestion,
  PolicyQuestions,
} from "@/components/shop/policy-page";
import { resolveDeliveryArea } from "@/lib/checkout/delivery";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Shipping & Delivery",
  description: "Where Fuckers Skateboards ships, what it costs, and how long it takes.",
};

export default function ShippingPage() {
  const deliveryArea = resolveDeliveryArea(env);

  return (
    <PolicyPage
      description="Where we ship, what it costs, and when to expect your order."
      effectiveDate="August 31, 2026"
      title="Shipping & delivery."
    >
      <PolicyQuestions>
        <PolicyQuestion question="Where do you ship?">
          <PolicyParagraph>
            We currently ship within Canada only. Checkout will not accept an address outside
            Canada.
          </PolicyParagraph>
        </PolicyQuestion>

        {deliveryArea ? (
          <PolicyQuestion question="Do I qualify for free local delivery?">
            <PolicyParagraph>
              Free local delivery is available within {deliveryArea.areaName}. Choose Local delivery
              in your cart and enter the delivery address at checkout. We confirm that the address
              is inside the delivery area, then contact you to arrange a delivery time.
            </PolicyParagraph>
            <PolicyParagraph>
              If the address is outside the delivery area, we refund the order so you can place it
              again with standard shipping.
            </PolicyParagraph>
            {deliveryArea.instructions ? (
              <PolicyParagraph>{deliveryArea.instructions}</PolicyParagraph>
            ) : null}
          </PolicyQuestion>
        ) : null}

        <PolicyQuestion question="What does standard shipping cost?">
          <PolicyParagraph>
            Shipping cost depends on the items in your order. The exact charge is shown at checkout
            before you pay.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Do you charge sales tax?">
          <PolicyParagraph>We do not currently charge sales tax at checkout.</PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="When will my order ship?">
          <PolicyParagraph>
            We pack and ship orders within 3 to 5 business days. We do not ship on weekends or
            holidays. Product drops may take longer, and we will note that on the site when it
            applies.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="How long does delivery take?">
          <PolicyParagraph>
            Standard shipping within Canada usually takes 3 to 7 business days after dispatch.
            Carrier estimates are not guarantees. Weather and carrier delays are outside our
            control.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Will I receive tracking?">
          <PolicyParagraph>
            When your order ships, we email the carrier and tracking number with a link to the
            carrier's tracking page when one is available. If that email has not arrived within 5
            business days of ordering, check your spam folder and contact us.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="What happens if my address is wrong or the package is returned?">
          <PolicyParagraph>
            Double-check your shipping address at checkout. We ship to the address you enter. If a
            package returns to us as undeliverable, we refund the order minus shipping costs, or
            resend it after you pay shipping again.
          </PolicyParagraph>
          <PolicyParagraph>
            We are not responsible for packages the carrier marks delivered but you report missing.
            File a claim with the carrier and contact us so we can help where possible.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="What should I do if tracking stops updating?">
          <PolicyParagraph>
            If tracking has not updated in 10 business days, email {env.SUPPORT_EMAIL} with your
            order number. We will investigate with the carrier.
          </PolicyParagraph>
        </PolicyQuestion>
      </PolicyQuestions>
    </PolicyPage>
  );
}
