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
  title: "Returns & Refunds",
  description: "How returns, exchanges, and refunds work at Fuckers Skateboards.",
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      description="What to do if something isn't right with your order."
      effectiveDate="August 12, 2026"
      title="Returns & refunds."
    >
      <PolicyDraftNotice />

      <PolicySection heading="Return window">
        <PolicyParagraph>
          Unused items in their original condition can be returned within 30 days of delivery. Items
          must be unworn, unwashed, and free of grip tape residue, with any original tags still
          attached.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="What cannot be returned">
        <PolicyList>
          <li>Decks that have been gripped, mounted, or ridden</li>
          <li>Items marked final sale or clearance</li>
          <li>Gift cards</li>
        </PolicyList>
      </PolicySection>

      <PolicySection heading="How to start a return">
        <PolicyParagraph>
          Email {env.SUPPORT_EMAIL} with your order number and a short description of the problem.
          We will reply with return instructions. Please do not ship anything back before contacting
          us — returns received without prior notice may not be processed.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Return shipping costs">
        <PolicyParagraph>
          Return shipping is paid by the customer unless the item arrived damaged or we sent the
          wrong item, in which case we cover it. Original shipping charges are non-refundable.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Refunds">
        <PolicyParagraph>
          Once we receive and inspect the return, we will issue a refund to the original payment
          method. Refunds are processed through Stripe, our payment processor, and typically appear
          within 5-10 business days depending on your bank.
        </PolicyParagraph>
        <PolicyParagraph>
          We can only refund to the payment method used for the original purchase.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Damaged, defective, or incorrect items">
        <PolicyParagraph>
          If your order arrives damaged or incorrect, email {env.SUPPORT_EMAIL} within 7 days of
          delivery with your order number and photos of the item and packaging. We will replace it
          or refund it at no cost to you.
        </PolicyParagraph>
        <PolicyParagraph>
          Manufacturing defects are assessed case by case. Normal wear from skating — including
          delamination, chips, razor tail, and flat spots — is not a defect.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Exchanges">
        <PolicyParagraph>
          We do not process direct exchanges. Return the original item for a refund and place a new
          order for the size or colour you want.
        </PolicyParagraph>
      </PolicySection>
    </PolicyPage>
  );
}
