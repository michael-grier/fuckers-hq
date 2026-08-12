import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import { formatMoney } from "@/lib/money";

export type DeliveryScheduledItem = {
  productName: string;
  variantName: string;
  quantity: number;
};

export type DeliveryScheduledView = {
  orderNumber: string;
  currency: string;
  totalCents: number;
  items: DeliveryScheduledItem[];
  /** The address the customer gave at checkout; empty when none was recorded. */
  deliveryAddressLines: string[];
};

type DeliveryScheduledEmailProps = {
  order: DeliveryScheduledView;
  supportEmail: string;
};

/** Tells the customer their local-delivery order is packed and a drop-off is being arranged. */
export function DeliveryScheduledEmail({ order, supportEmail }: DeliveryScheduledEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Order {order.orderNumber} is ready for delivery</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Heading style={styles.heading}>Your order is ready for delivery.</Heading>
          <Text style={styles.intro}>
            Order <strong>{order.orderNumber}</strong> is packed. We'll reach out to this email
            address to arrange a delivery day and time. Nothing left to pay.
          </Text>

          {order.deliveryAddressLines.length > 0 ? (
            <Section style={styles.section}>
              <Heading as="h2" style={styles.sectionHeading}>
                Delivering to
              </Heading>
              {order.deliveryAddressLines.map((line) => (
                <Text key={line} style={styles.addressLine}>
                  {line}
                </Text>
              ))}
            </Section>
          ) : null}

          <Section style={styles.section}>
            <Heading as="h2" style={styles.sectionHeading}>
              What's coming
            </Heading>
            {order.items.map((item) => (
              <Row key={`${item.productName}-${item.variantName}`} style={styles.itemRow}>
                <Column>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <Text style={styles.itemDetail}>
                    {item.variantName} × {item.quantity}
                  </Text>
                </Column>
              </Row>
            ))}
            <Hr style={styles.rule} />
            <Row>
              <Column>
                <Text style={styles.totalLabel}>Paid in full</Text>
              </Column>
              <Column align="right">
                <Text style={styles.totalValue}>
                  {formatMoney(order.totalCents, order.currency)}
                </Text>
              </Column>
            </Row>
          </Section>

          <Text style={styles.footer}>
            Need a different time? Contact us at{" "}
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
    margin: "0 0 28px",
  },
  section: {
    borderTop: "1px solid #e4e4e7",
    padding: "24px 0 8px",
  },
  sectionHeading: {
    fontSize: "18px",
    lineHeight: "24px",
    margin: "0 0 16px",
  },
  addressLine: {
    color: "#52525b",
    fontSize: "14px",
    lineHeight: "20px",
    margin: 0,
  },
  itemRow: {
    marginBottom: "14px",
  },
  itemName: {
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "20px",
    margin: 0,
  },
  itemDetail: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "18px",
    margin: "3px 0 0",
  },
  rule: {
    borderColor: "#e4e4e7",
    margin: "18px 0 10px",
  },
  totalLabel: {
    fontSize: "16px",
    fontWeight: "700",
    margin: "10px 0 0",
  },
  totalValue: {
    fontSize: "16px",
    fontWeight: "700",
    margin: "10px 0 0",
  },
  footer: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "24px 0 0",
  },
  link: {
    color: "#18181b",
    textDecoration: "underline",
  },
} as const;
