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

export type OrderShippedItem = {
  productName: string;
  variantName: string;
  quantity: number;
};

export type OrderShippedTracking = {
  carrierName: string;
  trackingNumber: string;
  /** Null for carriers with no stable single-number tracking page; the number still renders. */
  trackingUrl: string | null;
};

export type OrderShippedView = {
  orderNumber: string;
  items: OrderShippedItem[];
  shippingAddressLines: string[];
  tracking: OrderShippedTracking | null;
};

type OrderShippedEmailProps = {
  order: OrderShippedView;
  supportEmail: string;
};

/**
 * The shipment notice. Deliberately carries no prices or totals: the confirmation email is the
 * receipt, and repeating money here invites a customer to read it as a second charge.
 */
export function OrderShippedEmail({ order, supportEmail }: OrderShippedEmailProps) {
  const { tracking } = order;

  return (
    <Html lang="en">
      <Head />
      <Preview>Order {order.orderNumber} is on its way</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Heading style={styles.heading}>Your order is on its way.</Heading>
          <Text style={styles.intro}>
            Order <strong>{order.orderNumber}</strong> has shipped.{" "}
            {tracking
              ? "Track it with the details below."
              : "This shipment does not have a tracking number, so keep an eye out for it."}
          </Text>

          {tracking ? (
            <Section style={styles.section}>
              <Heading as="h2" style={styles.sectionHeading}>
                Tracking
              </Heading>
              <Text style={styles.carrierName}>{tracking.carrierName}</Text>
              <Text style={styles.trackingNumber}>{tracking.trackingNumber}</Text>
              {tracking.trackingUrl ? (
                <Link href={tracking.trackingUrl} style={styles.trackingButton}>
                  Track this shipment
                </Link>
              ) : null}
              <Text style={styles.trackingNote}>
                It can take a day or so before the carrier shows any movement.
              </Text>
            </Section>
          ) : null}

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

          <Section style={styles.section}>
            <Heading as="h2" style={styles.sectionHeading}>
              What's in the box
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
          </Section>

          <Text style={styles.footer}>
            Something not right? Contact us at{" "}
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
  carrierName: {
    fontSize: "15px",
    fontWeight: "700",
    lineHeight: "20px",
    margin: "0 0 4px",
  },
  trackingNumber: {
    color: "#52525b",
    fontFamily: "'Courier New', Courier, monospace",
    fontSize: "15px",
    letterSpacing: "0.5px",
    lineHeight: "20px",
    margin: 0,
  },
  trackingButton: {
    backgroundColor: "#18181b",
    borderRadius: "6px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "700",
    margin: "16px 0 0",
    padding: "12px 20px",
    textDecoration: "none",
  },
  trackingNote: {
    color: "#71717a",
    fontSize: "13px",
    lineHeight: "20px",
    margin: "16px 0 0",
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
