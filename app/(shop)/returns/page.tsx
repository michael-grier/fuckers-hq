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
  title: "Returns & Refunds",
  description: "How returns, exchanges, and refunds work at Fuckers Skateboards.",
};

export default function ReturnsPage() {
  return (
    <PolicyPage
      description="What to do if something isn't right with your order."
      effectiveDate="August 31, 2026"
      title="Returns & refunds."
    >
      <PolicyQuestions>
        <PolicyQuestion question="What can I return?">
          <PolicyParagraph>
            Unused items in their original condition may be returned within 30 days of delivery.
            Items must be unworn, unwashed, and free of grip tape residue, with any original tags
            still attached.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="What cannot be returned?">
          <PolicyList>
            <li>Decks that have been gripped, mounted, or ridden</li>
            <li>Items marked final sale or clearance</li>
          </PolicyList>
        </PolicyQuestion>

        <PolicyQuestion question="How do I start a return?">
          <PolicyParagraph>
            Email {env.SUPPORT_EMAIL} with your order number and a short description of the problem.
            We will reply with return instructions. Contact us before shipping anything back.
            Returns sent without prior notice may not be processed.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Who pays return shipping?">
          <PolicyParagraph>
            You pay return shipping unless the item arrived damaged or we sent the wrong item. We
            cover return shipping in those cases. Any shipping charge paid on the original order is
            not refundable.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="When will I receive my refund?">
          <PolicyParagraph>
            After we receive and inspect the return, we issue the refund to the original payment
            method through Stripe. It usually appears within 5 to 10 business days, depending on
            your bank.
          </PolicyParagraph>
          <PolicyParagraph>
            We can only refund the payment method used for the original purchase.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="What if my order arrives damaged, defective, or incorrect?">
          <PolicyParagraph>
            Email {env.SUPPORT_EMAIL} within 7 days of delivery with your order number and photos of
            the item and packaging. We will replace it or refund it at no cost to you.
          </PolicyParagraph>
          <PolicyParagraph>
            We assess manufacturing defects case by case. Delamination, chips, razor tail, flat
            spots, and other normal wear from skating are not defects.
          </PolicyParagraph>
        </PolicyQuestion>

        <PolicyQuestion question="Can I exchange an item?">
          <PolicyParagraph>
            We do not process direct exchanges. Return the original item for a refund and place a
            new order for the size or colour you want.
          </PolicyParagraph>
        </PolicyQuestion>
      </PolicyQuestions>
    </PolicyPage>
  );
}
