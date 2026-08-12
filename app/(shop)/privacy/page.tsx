import type { Metadata } from "next";

import { PolicyDraftNotice } from "@/components/shop/policy-draft-notice";
import {
  PolicyList,
  PolicyPage,
  PolicyParagraph,
  PolicySection,
} from "@/components/shop/policy-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What personal information Fuckers Skateboards collects, and how it is used.",
};

export default function PrivacyPage() {
  return (
    <PolicyPage
      description="What we collect, why we collect it, and who we share it with."
      effectiveDate="[EFFECTIVE DATE]"
      title="Privacy policy."
    >
      <PolicyDraftNotice />

      <PolicySection heading="Who we are">
        <PolicyParagraph>
          This store is operated by [LEGAL NAME OF OPERATOR] ("we", "us") based in [CITY, PROVINCE,
          COUNTRY]. For any privacy question, contact [SUPPORT EMAIL].
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="What we collect">
        <PolicyList>
          <li>
            <span className="font-semibold text-foreground">Order information.</span> Your email
            address, shipping address, and the items you purchased.
          </li>
          <li>
            <span className="font-semibold text-foreground">Payment information.</span> Handled
            entirely by Stripe. Card numbers are entered on Stripe's hosted checkout page and never
            reach our servers. We receive only a payment confirmation and limited details such as
            the card brand and last four digits.
          </li>
          <li>
            <span className="font-semibold text-foreground">Your cart.</span> Stored in your own
            browser's local storage. It is not sent to us until you begin checkout.
          </li>
          <li>
            <span className="font-semibold text-foreground">Technical error data.</span> When
            something breaks, our error monitoring records technical details about the failure to
            help us fix it.
          </li>
        </PolicyList>
        <PolicyParagraph>
          You do not need an account to shop here. Accounts exist only for store staff.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="What we do not do">
        <PolicyList>
          <li>We do not sell or rent your personal information.</li>
          <li>We do not run advertising or cross-site tracking pixels on this store.</li>
          <li>We do not store your card details.</li>
          <li>
            We do not send marketing email unless you explicitly ask us to. Order confirmations are
            transactional and are sent for every purchase.
          </li>
        </PolicyList>
      </PolicySection>

      <PolicySection heading="Service providers we share data with">
        <PolicyParagraph>
          We use the following providers to run the store. Each receives only what it needs.
        </PolicyParagraph>
        <PolicyList>
          <li>
            <span className="font-semibold text-foreground">Stripe</span> — payment processing, tax,
            refunds, and fraud prevention
          </li>
          <li>
            <span className="font-semibold text-foreground">Resend</span> — sending order
            confirmation email
          </li>
          <li>
            <span className="font-semibold text-foreground">Neon</span> — the database that stores
            order records
          </li>
          <li>
            <span className="font-semibold text-foreground">Vercel</span> — website hosting
          </li>
          <li>
            <span className="font-semibold text-foreground">Cloudflare R2</span> — product image
            hosting
          </li>
          <li>
            <span className="font-semibold text-foreground">Clerk</span> — sign-in for store staff
            only
          </li>
          <li>
            <span className="font-semibold text-foreground">Sentry</span> — error monitoring
          </li>
        </PolicyList>
        <PolicyParagraph>
          Some of these providers process data outside [COUNTRY], including in the United States. By
          placing an order you consent to that transfer.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Cookies and local storage">
        <PolicyParagraph>
          We use browser storage for two things: keeping your cart between visits, and keeping store
          staff signed in. We do not use advertising or analytics cookies. Clearing your browser
          storage will empty your cart.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="How long we keep it">
        <PolicyParagraph>
          Order records — including email and shipping address — are kept for [RETENTION PERIOD,
          e.g. 7 years] because tax and accounting rules require us to retain sales records. Error
          monitoring data is kept for [ERROR DATA RETENTION, e.g. 90 days].
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Your rights">
        <PolicyParagraph>
          You can ask us what personal information we hold about you, ask for corrections, or ask us
          to delete it. Email [SUPPORT EMAIL] and we will respond within [RESPONSE WINDOW, e.g. 30]
          days.
        </PolicyParagraph>
        <PolicyParagraph>
          Note that we cannot delete order records we are legally required to retain, and deleting
          them would not remove Stripe's own record of the transaction.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Children">
        <PolicyParagraph>
          This store is not directed at children under [MINIMUM AGE, e.g. 13], and we do not
          knowingly collect their personal information.
        </PolicyParagraph>
      </PolicySection>

      <PolicySection heading="Changes to this policy">
        <PolicyParagraph>
          If we change this policy we will update the effective date above. Significant changes will
          be announced on the site.
        </PolicyParagraph>
      </PolicySection>
    </PolicyPage>
  );
}
