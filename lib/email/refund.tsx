import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { formatMoney } from "@/lib/money";

export type RefundEmailView = {
  orderNumber: string;
  currency: string;
  totalCents: number;
  refundAmountCents: number;
  refundCumulativeCents: number;
};

type RefundEmailProps = {
  order: RefundEmailView;
  supportEmail: string;
};

/** Renders the immutable financial snapshot captured when one refund advance was recorded. */
export function RefundEmail({ order, supportEmail }: RefundEmailProps) {
  const remainingPaidCents = order.totalCents - order.refundCumulativeCents;
  const isFullRefund = remainingPaidCents === 0;

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {isFullRefund
          ? `Order ${order.orderNumber} has been fully refunded`
          : `A partial refund was issued for order ${order.orderNumber}`}
      </Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Heading style={styles.heading}>
            {isFullRefund ? "Your order is fully refunded." : "We issued a partial refund."}
          </Heading>
          <Text style={styles.intro}>
            {isFullRefund ? "We issued the remaining refund for" : "We refunded part of"} order{" "}
            <strong>{order.orderNumber}</strong> to your original payment method.
          </Text>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.sectionHeading}>
              Refund summary
            </Heading>
            <MoneyRow
              label="Refunded this time"
              value={formatMoney(order.refundAmountCents, order.currency)}
            />
            <MoneyRow
              label="Total refunded"
              value={formatMoney(order.refundCumulativeCents, order.currency)}
            />
            <MoneyRow
              label="Remaining paid"
              value={formatMoney(remainingPaidCents, order.currency)}
              strong
            />
          </Section>

          <Text style={styles.footer}>
            Your bank may take a few business days to post the refund. Questions? Contact us at{" "}
            <Link href={`mailto:${supportEmail}`} style={styles.link}>
              {supportEmail}
            </Link>
            .
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

function MoneyRow({ label, strong, value }: { label: string; strong?: boolean; value: string }) {
  return (
    <Row>
      <Column>
        <Text style={strong ? styles.totalLabel : styles.rowLabel}>{label}</Text>
      </Column>
      <Column align="right">
        <Text style={strong ? styles.totalValue : styles.rowValue}>{value}</Text>
      </Column>
    </Row>
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
    letterSpacing: "0.12em",
    margin: "0 0 12px",
    textTransform: "uppercase" as const,
  },
  heading: {
    fontSize: "30px",
    lineHeight: "1.15",
    margin: "0 0 16px",
  },
  intro: {
    color: "#3f3f46",
    fontSize: "16px",
    lineHeight: "1.6",
    margin: "0",
  },
  section: {
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    margin: "28px 0",
    padding: "20px",
  },
  sectionHeading: {
    fontSize: "18px",
    margin: "0 0 10px",
  },
  rowLabel: {
    color: "#52525b",
    fontSize: "14px",
    margin: "8px 0",
  },
  rowValue: {
    fontSize: "14px",
    margin: "8px 0",
  },
  totalLabel: {
    borderTop: "1px solid #e4e4e7",
    fontSize: "15px",
    fontWeight: "700",
    margin: "10px 0 0",
    paddingTop: "14px",
  },
  totalValue: {
    borderTop: "1px solid #e4e4e7",
    fontSize: "15px",
    fontWeight: "700",
    margin: "10px 0 0",
    paddingTop: "14px",
  },
  footer: {
    color: "#52525b",
    fontSize: "13px",
    lineHeight: "1.6",
    margin: 0,
  },
  link: {
    color: "#18181b",
    textDecoration: "underline",
  },
};
