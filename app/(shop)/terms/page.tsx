import type { Metadata } from "next";

import {
  PolicyList,
  PolicyPage,
  PolicyParagraph,
  PolicyQuestion,
  PolicyQuestions,
} from "@/components/shop/policy-page";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that apply when you buy from Fuckers Skateboards.",
};

export default function TermsPage() {
  return (
    <PolicyPage
      description="The rules that apply when you shop with us."
      effectiveDate="August 31, 2026"
      title="Terms of service."
    >
      <PolicyQuestions>
        <PolicyQuestion question="Who operates this store?">
          <PolicyParagraph>
            This store is operated by Tristan Hawkins, located in Calgary, Alberta, Canada. By
            placing an order you agree to these terms.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="When is my order accepted?">
          <PolicyParagraph>
            Adding an item to your cart does not reserve it. We confirm availability when checkout
            starts and reserve the items while you complete payment.
          </PolicyParagraph>
          <PolicyParagraph>
            We may cancel and fully refund an order if an item turns out to be unavailable, if a
            price or description was listed in error, or if we suspect fraudulent or abusive
            purchasing. If we cancel your order, you will receive a full refund.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="How do pricing, payment, shipping, and tax work?">
          <PolicyParagraph>
            All prices are in Canadian dollars (CAD). Prices may change at any time, but the price
            you see at checkout is the price you pay for that order.
          </PolicyParagraph>
          <PolicyParagraph>
            Payments are processed by Stripe. We do not receive or store your card details. Stripe's
            own terms apply to the payment itself.
          </PolicyParagraph>
          <PolicyParagraph>
            Standard shipping is available within Canada. Its cost depends on the items in your
            order and is shown before payment. Eligible local delivery is free. We do not currently
            charge sales tax at checkout.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Where can I find the shipping and return rules?">
          <PolicyParagraph>
            Shipping and returns are covered by our Shipping &amp; Delivery and Returns &amp;
            Refunds policies, which form part of these terms.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Will every product look exactly like its photos?">
          <PolicyParagraph>
            We try to describe and photograph products accurately, but colours vary between screens
            and graphics may shift slightly between production runs. Minor variation is not a
            defect.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="What risks come with using these products?">
          <PolicyParagraph>
            Skateboarding is dangerous and can cause serious injury or death. You are responsible
            for assembling, inspecting, and maintaining your equipment, for wearing appropriate
            protective gear, and for skating within your ability. To the fullest extent permitted by
            law, we are not liable for injury, death, or property damage arising from the use of
            products purchased from this store.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Can I reuse the brand's content?">
          <PolicyParagraph>
            All brand names, logos, graphics, photography, and video on this site belong to Tristan
            Hawkins or are used with permission. You may not reproduce, resell, or use them
            commercially without written permission.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="What site use is prohibited?">
          <PolicyList>
            <li>Do not attempt to breach, probe, or disrupt this site or its infrastructure.</li>
            <li>
              Do not scrape the site or place automated or bulk orders without our permission.
            </li>
            <li>Do not place orders using someone else's payment method.</li>
          </PolicyList>
        </PolicyQuestion>

        <PolicyQuestion question="How is liability limited?">
          <PolicyParagraph>
            To the fullest extent permitted by law, our total liability for any claim relating to an
            order is limited to the amount you paid for that order. We are not liable for indirect
            or consequential losses.
          </PolicyParagraph>
          <PolicyParagraph>
            Nothing in these terms limits rights you have under applicable consumer protection law
            that cannot be waived.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Which laws apply?">
          <PolicyParagraph>
            These terms are governed by the laws of Alberta and Canada. Disputes will be heard in
            the courts of Calgary, Alberta.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Can these terms change?">
          <PolicyParagraph>
            We may update these terms. The version in effect when you place an order is the version
            that applies to it.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="How can I ask a question about these terms?">
          <PolicyParagraph>Questions about these terms: {env.SUPPORT_EMAIL}.</PolicyParagraph>
        </PolicyQuestion>
      </PolicyQuestions>
    </PolicyPage>
  );
}
