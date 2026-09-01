import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

import { formatMoney } from "@/lib/money";

export type ShippingPaymentRequestView = {
  orderNumber: string;
  amountCents: number;
  currency: string;
  checkoutUrl: string;
  expiresAt: Date;
};

type ShippingPaymentRequestEmailProps = {
  order: ShippingPaymentRequestView;
  supportEmail: string;
};

/** Explains why regular shipping is needed and gives the customer one secure payment action. */
export function ShippingPaymentRequestEmail({
  order,
  supportEmail,
}: ShippingPaymentRequestEmailProps) {
  const expiresAt = order.expiresAt.toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Edmonton",
  });

  return (
    <Html lang="en">
      <Head />
      <Preview>Shipping is needed for order {order.orderNumber}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Heading style={styles.heading}>Your address is outside our free delivery area.</Heading>
          <Text style={styles.intro}>
            We reviewed the address for order <strong>{order.orderNumber}</strong>. We can still
            send it by regular shipping for {formatMoney(order.amountCents, order.currency)}, plus
            any applicable tax.
          </Text>

          <Section style={styles.actionSection}>
            <Button href={order.checkoutUrl} style={styles.button}>
              Pay for shipping
            </Button>
            <Text style={styles.expiry}>This secure Stripe link expires {expiresAt} MT.</Text>
          </Section>

          <Text style={styles.copy}>
            If you would rather cancel, reply to this email or contact us at{" "}
            <Link href={`mailto:${supportEmail}`} style={styles.link}>
              {supportEmail}
            </Link>
            . We will refund the original order.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: {
    backgroundColor: "#f5f5f4",
    color: "#18181b",
    fontFamily: "Arial, Helvetica, sans-serif",
    margin: 0,
    padding: "32px 12px",
  },
  container: {
    backgroundColor: "#ffffff",
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    margin: "0 auto",
    maxWidth: "600px",
    padding: "32px",
  },
  eyebrow: {
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "1.5px",
    margin: "0 0 12px",
  },
  heading: {
    fontSize: "30px",
    lineHeight: "36px",
    margin: "0 0 12px",
  },
  intro: {
    color: "#52525b",
    fontSize: "16px",
    lineHeight: "24px",
    margin: "0 0 24px",
  },
  actionSection: {
    borderTop: "1px solid #e4e4e7",
    padding: "24px 0 8px",
  },
  button: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: "700",
    padding: "12px 18px",
    textDecoration: "none",
  },
  expiry: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "12px 0 0",
  },
  copy: {
    color: "#52525b",
    fontSize: "14px",
    lineHeight: "21px",
    margin: "24px 0 0",
  },
  link: {
    color: "#18181b",
    textDecoration: "underline",
  },
} as const;
