import type { Metadata } from "next";

import { PolicyDraftNotice } from "@/components/shop/policy-draft-notice";
import {
  PolicyList,
  PolicyPage,
  PolicyParagraph,
  PolicySection,
} from "@/components/shop/policy-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you buy from Fuckers Skateboards.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      description="The rules that apply when you shop with us."
      effectiveDate="[EFFECTIVE DATE]"
      title="Terms of service."
    >
      <PolicyDraftNotice />

      <PolicySection heading="Who you are dealing with">
        <PolicyParagraph>
          This store is operated by [LEGAL NAME OF OPERATOR], located in [CITY, PROVINCE, COUNTRY].
          By placing an order you agree to these terms.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Orders and acceptance">
        <PolicyParagraph>
          Adding an item to your cart does not reserve it. Stock is confirmed when your payment is
          completed, and items can sell out while you are checking out.
        </PolicyParagraph>
        <PolicyParagraph>
          We may cancel and fully refund an order if an item turns out to be unavailable, if a price
          or description was listed in error, or if we suspect fraudulent or abusive purchasing. If
          we cancel your order, you will receive a full refund.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Pricing and payment">
        <PolicyParagraph>
          All prices are in [CURRENCY, e.g. Canadian dollars (CAD)]. Prices may change at any time,
          but the price you see at checkout is the price you pay for that order.
        </PolicyParagraph>
        <PolicyParagraph>
          Payments are processed by Stripe. We do not receive or store your card details. Stripe's
          own terms apply to the payment itself.
        </PolicyParagraph>
        <PolicyParagraph>
          [TAX STATEMENT: e.g. Sales tax is not charged, as we are not currently registered to
          collect it. / Applicable sales tax is calculated and shown at checkout.]
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Shipping, returns, and refunds">
        <PolicyParagraph>
          Shipping and returns are covered by our Shipping &amp; Delivery and Returns &amp; Refunds
          policies, which form part of these terms.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Product descriptions and images">
        <PolicyParagraph>
          We try to describe and photograph products accurately, but colours vary between screens
          and graphics may shift slightly between production runs. Minor variation is not a defect.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Assumption of risk">
        <PolicyParagraph>
          Skateboarding is dangerous and can cause serious injury or death. You are responsible for
          assembling, inspecting, and maintaining your equipment, for wearing appropriate protective
          gear, and for skating within your ability. To the fullest extent permitted by law, we are
          not liable for injury, death, or property damage arising from the use of products
          purchased from this store.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Intellectual property">
        <PolicyParagraph>
          All brand names, logos, graphics, photography, and video on this site belong to [LEGAL
          NAME OF OPERATOR] or are used with permission. You may not reproduce, resell, or use them
          commercially without written permission.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Acceptable use">
        <PolicyList>
          <li>Do not attempt to breach, probe, or disrupt this site or its infrastructure.</li>
          <li>Do not scrape the site or place automated or bulk orders without our permission.</li>
          <li>Do not place orders using someone else's payment method.</li>
        </PolicyList>
      </PolicySection>

      <PolicySection heading="Limitation of liability">
        <PolicyParagraph>
          To the fullest extent permitted by law, our total liability for any claim relating to an
          order is limited to the amount you paid for that order. We are not liable for indirect or
          consequential losses.
        </PolicyParagraph>
        <PolicyParagraph>
          Nothing in these terms limits rights you have under applicable consumer protection law
          that cannot be waived.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Governing law">
        <PolicyParagraph>
          These terms are governed by the laws of [PROVINCE/STATE] and [COUNTRY]. Disputes will be
          heard in the courts of [JURISDICTION].
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Changes to these terms">
        <PolicyParagraph>
          We may update these terms. The version in effect when you place an order is the version
          that applies to it.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Contact">
        <PolicyParagraph>Questions about these terms: [SUPPORT EMAIL].</PolicyParagraph>
      </PolicySection>
    </PolicyPage>
  );
}
