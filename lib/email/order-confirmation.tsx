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

export type OrderConfirmationItem = {
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
};

export type OrderConfirmationView = {
  orderNumber: string;
  currency: string;
  subtotalCents: number;
  taxCents: number;
  shippingCents: number;
  totalCents: number;
  items: OrderConfirmationItem[];
  shippingAddressLines: string[];
};

type OrderConfirmationEmailProps = {
  order: OrderConfirmationView;
  supportEmail: string;
};

export function OrderConfirmationEmail({ order, supportEmail }: OrderConfirmationEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Your Fuckers Skateboards order {order.orderNumber} is confirmed</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Heading style={styles.heading}>Thanks for your order.</Heading>
          <Text style={styles.intro}>
            We received your payment. Your order number is <strong>{order.orderNumber}</strong>.
          </Text>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.sectionHeading}>
              Order summary
            </Heading>
            {order.items.map((item) => (
              <Row key={`${item.productName}-${item.variantName}`} style={styles.itemRow}>
                <Column>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <Text style={styles.itemDetail}>
                    {item.variantName} × {item.quantity}
                  </Text>
                </Column>
                <Column align="right">
                  <Text style={styles.itemPrice}>
                    {formatMoney(item.unitPriceCents * item.quantity, order.currency)}
                  </Text>
                </Column>
              </Row>
            ))}
            <Hr style={styles.rule} />
            <TotalRow label="Subtotal" value={formatMoney(order.subtotalCents, order.currency)} />
            <TotalRow label="Shipping" value={formatMoney(order.shippingCents, order.currency)} />
            <TotalRow label="Tax" value={formatMoney(order.taxCents, order.currency)} />
            <Row>
              <Column>
                <Text style={styles.totalLabel}>Total</Text>
              </Column>
              <Column align="right">
                <Text style={styles.totalValue}>
                  {formatMoney(order.totalCents, order.currency)}
                </Text>
              </Column>
            </Row>
          </Section>

          {order.shippingAddressLines.length > 0 ? (
            <Section style={styles.section}>
              <Heading as="h2" style={styles.sectionHeading}>
                Shipping to
              </Heading>
              {order.shippingAddressLines.map((line) => (
                <Text key={line} style={styles.addressLine}>
                  {line}
                </Text>
              ))}
            </Section>
          ) : null}

          <Text style={styles.footer}>
            Questions about your order? Contact us at{" "}
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

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <Row>
      <Column>
        <Text style={styles.totalRowLabel}>{label}</Text>
      </Column>
      <Column align="right">
        <Text style={styles.totalRowValue}>{value}</Text>
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
  itemPrice: {
    fontSize: "15px",
    fontWeight: "700",
    margin: 0,
  },
  rule: {
    borderColor: "#e4e4e7",
    margin: "18px 0 10px",
  },
  totalRowLabel: {
    color: "#52525b",
    fontSize: "14px",
    margin: "5px 0",
  },
  totalRowValue: {
    fontSize: "14px",
    margin: "5px 0",
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
  addressLine: {
    color: "#52525b",
    fontSize: "14px",
    lineHeight: "20px",
    margin: 0,
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
