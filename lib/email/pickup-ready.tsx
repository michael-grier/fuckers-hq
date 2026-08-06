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

export type PickupReadyItem = {
  productName: string;
  variantName: string;
  quantity: number;
};

export type PickupReadyView = {
  orderNumber: string;
  currency: string;
  totalCents: number;
  items: PickupReadyItem[];
  pickupLocationName: string;
  pickupAddressLines: string[];
  pickupHours: string;
  pickupInstructions: string | null;
};

type PickupReadyEmailProps = {
  order: PickupReadyView;
  supportEmail: string;
};

export function PickupReadyEmail({ order, supportEmail }: PickupReadyEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Order {order.orderNumber} is ready to pick up</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Heading style={styles.heading}>Your order is ready.</Heading>
          <Text style={styles.intro}>
            Order <strong>{order.orderNumber}</strong> is packed and waiting for you. Nothing left
            to pay — just bring your order number.
          </Text>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.sectionHeading}>
              Where to collect it
            </Heading>
            <Text style={styles.locationName}>{order.pickupLocationName}</Text>
            {order.pickupAddressLines.map((line) => (
              <Text key={line} style={styles.addressLine}>
                {line}
              </Text>
            ))}
            <Text style={styles.hours}>{order.pickupHours}</Text>
            {order.pickupInstructions ? (
              <Text style={styles.instructions}>{order.pickupInstructions}</Text>
            ) : null}
          </Section>

          <Section style={styles.section}>
            <Heading as="h2" style={styles.sectionHeading}>
              What's waiting
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
  locationName: {
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "20px",
    margin: "0 0 4px",
  },
  addressLine: {
    color: "#52525b",
    fontSize: "14px",
    lineHeight: "20px",
    margin: 0,
  },
  hours: {
    fontSize: "14px",
    fontWeight: "700",
    lineHeight: "20px",
    margin: "12px 0 0",
  },
  instructions: {
    color: "#52525b",
    fontSize: "14px",
    lineHeight: "20px",
    margin: "12px 0 0",
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
