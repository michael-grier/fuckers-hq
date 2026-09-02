import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

import type { FulfillmentMethod, Order } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

export type AdminNewOrderItem = {
  productName: string;
  variantName: string;
  unitPriceCents: number;
  quantity: number;
};

export type AdminNewOrderView = {
  orderNumber: string;
  fulfillmentMethod: FulfillmentMethod;
  inventoryStatus: Order["inventoryStatus"];
  refundStatus: Order["refundStatus"];
  currency: string;
  totalCents: number;
  items: AdminNewOrderItem[];
  adminOrderUrl: string;
};

type AdminNewOrderEmailProps = {
  order: AdminNewOrderView;
};

/** Renders the privacy-minimized alert sent to the administrator responsible for fulfillment. */
export function AdminNewOrderEmail({ order }: AdminNewOrderEmailProps) {
  const isLocalDelivery = order.fulfillmentMethod === "delivery";
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0);
  const preview = `${isLocalDelivery ? "Local delivery" : "Paid shipping"}: ${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  const nextStep =
    order.refundStatus === "full"
      ? "No fulfillment is required. This order has already been fully refunded."
      : order.inventoryStatus === "exception"
        ? "Resolve the inventory exception before fulfilling this order."
        : isLocalDelivery
          ? "Review the delivery address and arrange the drop-off."
          : "Open the order, pack the items, and prepare the shipment.";

  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Text style={styles.eyebrow}>Fuckers Skateboards</Text>
          <Text style={styles.alert}>New paid order</Text>
          <Heading style={styles.heading}>
            {isLocalDelivery ? "Local delivery" : "Paid shipping"}
          </Heading>
          <Text style={styles.meta}>
            {order.orderNumber} · {itemCount} {itemCount === 1 ? "item" : "items"}
          </Text>

          <Section style={styles.summary}>
            <Heading as="h2" style={styles.sectionHeading}>
              What sold
            </Heading>
            {order.items.map((item) => (
              <Row key={`${item.productName}-${item.variantName}`} style={styles.itemRow}>
                <Column>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <Text style={styles.itemDetail}>
                    {item.variantName} · Quantity {item.quantity}
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
            <Row>
              <Column>
                <Text style={styles.totalLabel}>Paid total</Text>
              </Column>
              <Column align="right">
                <Text style={styles.totalValue}>
                  {formatMoney(order.totalCents, order.currency)}
                </Text>
              </Column>
            </Row>
          </Section>

          <Section style={styles.actionSection}>
            <Text style={styles.actionEyebrow}>Next step</Text>
            <Text style={styles.actionCopy}>{nextStep}</Text>
            <Button href={order.adminOrderUrl} style={styles.button}>
              Open order in admin
            </Button>
          </Section>

          <Text style={styles.footer}>
            Customer contact and address details stay behind the admin login.
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
    margin: "0 0 22px",
    textTransform: "uppercase" as const,
  },
  alert: {
    color: "#a16207",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "1px",
    margin: "0 0 6px",
    textTransform: "uppercase" as const,
  },
  heading: {
    fontSize: "30px",
    lineHeight: "36px",
    margin: "0 0 8px",
  },
  meta: {
    color: "#71717a",
    fontSize: "14px",
    margin: "0 0 26px",
  },
  summary: {
    border: "1px solid #e4e4e7",
    borderRadius: "8px",
    padding: "20px",
  },
  sectionHeading: {
    color: "#71717a",
    fontSize: "12px",
    letterSpacing: "1px",
    margin: "0 0 18px",
    textTransform: "uppercase" as const,
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
  totalLabel: {
    color: "#52525b",
    fontSize: "14px",
    margin: "5px 0",
  },
  totalValue: {
    fontSize: "18px",
    fontWeight: "700",
    margin: "5px 0",
  },
  actionSection: {
    backgroundColor: "#18181b",
    borderRadius: "8px",
    margin: "24px 0",
    padding: "20px",
  },
  actionEyebrow: {
    color: "#ffc42e",
    fontSize: "12px",
    fontWeight: "700",
    letterSpacing: "1.5px",
    margin: "0 0 8px",
    textTransform: "uppercase" as const,
  },
  actionCopy: {
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "700",
    lineHeight: "24px",
    margin: "0 0 18px",
  },
  button: {
    backgroundColor: "#ffffff",
    borderRadius: "6px",
    color: "#18181b",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: "700",
    padding: "12px 18px",
    textDecoration: "none",
  },
  footer: {
    color: "#71717a",
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0,
  },
} as const;
