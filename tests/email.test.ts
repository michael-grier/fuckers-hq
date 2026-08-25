import { describe, expect, mock, test } from "bun:test";
import { render } from "@react-email/components";
import { createElement } from "react";
import type { CreateEmailOptions } from "resend";

import { orderEmailKindValues } from "@/lib/db/schema";
import {
  type ConfirmationEmailDelivery,
  deliverOrderConfirmation,
} from "@/lib/email/deliver-order-confirmation";
import { deliverOrderShipped } from "@/lib/email/deliver-order-shipped";
import { DeliveryScheduledEmail, type DeliveryScheduledView } from "@/lib/email/delivery-scheduled";
import { OrderConfirmationEmail } from "@/lib/email/order-confirmation";
import {
  attemptOrderEmailDelivery,
  deliverDueOrderEmails,
  makeOrderEmailIdempotencyKey,
  type OrderEmailDeliveryRepository,
  type OrderEmailRef,
} from "@/lib/email/order-email-delivery";
import { OrderEmailDeliveryError } from "@/lib/email/order-email-transport";
import { OrderShippedEmail, type OrderShippedView } from "@/lib/email/order-shipped";
import { sendConfirmationAfterOrderCommit } from "@/lib/email/send-after-order";
import { getShippingAddressLines } from "@/lib/orders/shipping-address";
import {
  getShippingCarrierLabel,
  getShippingCarrierTrackingUrl,
  resolveOrderTracking,
  shippingCarrierValues,
} from "@/lib/orders/shipping-carriers";

const delivery: ConfirmationEmailDelivery = {
  orderId: "9c786325-fb57-46e3-b3ed-a60b653b3ad8",
  idempotencyKey: "order-confirmation/9c786325-fb57-46e3-b3ed-a60b653b3ad8",
  recipientEmail: "skater@example.com",
  order: {
    orderNumber: "FHQ-20260713-ABC12345",
    currency: "cad",
    subtotalCents: 8900,
    taxCents: 0,
    shippingCents: 1500,
    totalCents: 10400,
    items: [
      {
        productName: "Database Deck",
        variantName: '8.25"',
        unitPriceCents: 8900,
        quantity: 1,
      },
    ],
    shippingAddressLines: ["Test Skater", "123 Test Street", "Calgary, AB T1T 1T1", "CA"],
    isLocalDelivery: false,
  },
};

const confirmationRef: OrderEmailRef = { orderId: delivery.orderId, kind: "confirmation" };
const deliveryScheduledRef: OrderEmailRef = {
  orderId: delivery.orderId,
  kind: "delivery_scheduled",
};
const shippedRef: OrderEmailRef = { orderId: delivery.orderId, kind: "shipped" };

const shippedView: OrderShippedView = {
  orderNumber: "FHQ-20260713-ABC12345",
  items: [{ productName: "Database Deck", variantName: '8.25"', quantity: 1 }],
  shippingAddressLines: ["Test Skater", "123 Test Street", "Calgary, AB T1T 1T1", "CA"],
  tracking: {
    carrierName: "Canada Post",
    trackingNumber: "1234 5678 9123 4567",
    trackingUrl: getShippingCarrierTrackingUrl("canada_post", "1234 5678 9123 4567"),
  },
};

const deliveryScheduledView: DeliveryScheduledView = {
  orderNumber: "FHQ-20260713-ABC12345",
  currency: "cad",
  totalCents: 8900,
  items: [{ productName: "Database Deck", variantName: '8.25"', quantity: 1 }],
  deliveryAddressLines: ["Test Skater", "123 Test Street", "Calgary, AB T1T 1T1", "CA"],
};

describe("order confirmation template", () => {
  test("renders persisted snapshots, totals, shipping, and support details", async () => {
    const html = await render(
      createElement(OrderConfirmationEmail, {
        order: delivery.order,
        supportEmail: "support@example.com",
      }),
    );

    expect(html).toContain("FHQ-20260713-ABC12345");
    expect(html).toContain("Database Deck");
    expect(html).toContain("8.25&quot;");
    expect(html).toContain("$104.00");
    expect(html).toContain("123 Test Street");
    expect(html).toContain("support@example.com");
    expect(html).not.toContain(delivery.orderId);
  });

  test("formats Stripe shipping details and tolerates unavailable addresses", () => {
    expect(
      getShippingAddressLines({
        name: "Test Skater",
        address: {
          line1: "123 Test Street",
          city: "Calgary",
          state: "AB",
          postal_code: "T1T 1T1",
          country: "CA",
        },
      }),
    ).toEqual(["Test Skater", "123 Test Street", "Calgary, AB T1T 1T1", "CA"]);
    expect(getShippingAddressLines(null)).toEqual([]);
    expect(getShippingAddressLines({ address: "invalid" })).toEqual([]);
  });
});

describe("order confirmation delivery", () => {
  test("sends a React email with a stable order idempotency key", async () => {
    let message: CreateEmailOptions | undefined;
    let idempotencyKey: string | undefined;

    const emailId = await deliverOrderConfirmation(
      delivery,
      {
        from: "Fuckers Skateboards <orders@example.com>",
        supportEmail: "support@example.com",
      },
      {
        send: async (input, options) => {
          message = input;
          idempotencyKey = options.idempotencyKey;
          return {
            data: { id: "email_123" },
            error: null,
            headers: null,
          };
        },
      },
    );

    expect(emailId).toBe("email_123");
    expect(message).toMatchObject({
      from: "Fuckers Skateboards <orders@example.com>",
      to: "skater@example.com",
      replyTo: "support@example.com",
      subject: "Order FHQ-20260713-ABC12345 confirmed",
    });
    expect(idempotencyKey).toBe(delivery.idempotencyKey);
  });

  test("turns Resend API errors into catchable delivery errors", async () => {
    await expect(
      deliverOrderConfirmation(
        delivery,
        {
          from: "Fuckers Skateboards <orders@example.com>",
          supportEmail: "support@example.com",
        },
        {
          send: async () => ({
            data: null,
            error: {
              message: "Sender domain is not verified.",
              name: "validation_error",
              statusCode: 422,
            },
            headers: null,
          }),
        },
      ),
    ).rejects.toThrow(OrderEmailDeliveryError);
  });
});

describe("post-commit email boundary", () => {
  test("attempts delivery for new orders and idempotent webhook replays", async () => {
    const sentRefs: OrderEmailRef[] = [];
    const attempt = async (ref: OrderEmailRef) => {
      sentRefs.push(ref);
      return { status: "sent" } as const;
    };

    expect(
      await sendConfirmationAfterOrderCommit(
        { handled: true, created: true, orderId: delivery.orderId },
        attempt,
        () => {},
      ),
    ).toBe(true);
    expect(
      await sendConfirmationAfterOrderCommit(
        { handled: true, created: false, orderId: delivery.orderId },
        attempt,
        () => {},
      ),
    ).toBe(true);
    expect(
      await sendConfirmationAfterOrderCommit(
        {
          handled: true,
          paymentUpdated: true,
          changed: true,
          orderId: delivery.orderId,
        },
        attempt,
        () => {},
      ),
    ).toBe(false);
    expect(await sendConfirmationAfterOrderCommit({ handled: false }, attempt, () => {})).toBe(
      false,
    );
    expect(sentRefs).toEqual([confirmationRef, confirmationRef]);
  });

  test("reports email failure without rejecting the persisted webhook result", async () => {
    const reportedErrors: unknown[] = [];
    const result = await sendConfirmationAfterOrderCommit(
      { handled: true, created: true, orderId: delivery.orderId },
      async () => ({ status: "failed", error: new Error("Resend unavailable"), terminal: false }),
      (error) => {
        reportedErrors.push(error);
      },
    );

    expect(result).toBe(false);
    expect(reportedErrors).toHaveLength(1);
    expect(reportedErrors[0]).toBeInstanceOf(Error);
  });
});

describe("durable order confirmation retries", () => {
  test("records a first failure and succeeds later with the same idempotency key", async () => {
    const idempotencyKey = makeOrderEmailIdempotencyKey(delivery.orderId, "confirmation");
    let attemptCount = 0;
    const failedAttempts: number[] = [];
    const completedAttempts: number[] = [];
    const repository: OrderEmailDeliveryRepository = {
      claimDelivery: mock(async () => ({
        id: "delivery_123",
        orderId: delivery.orderId,
        kind: "confirmation" as const,
        idempotencyKey,
        attemptCount: ++attemptCount,
      })),
      markDelivered: mock(async (attempt) => {
        completedAttempts.push(attempt.attemptCount);
        return true;
      }),
      markFailed: mock(async (attempt) => {
        failedAttempts.push(attempt.attemptCount);
        expect(attempt.errorCode).toBe("delivery_error");
        expect(attempt.terminal).toBe(false);
        return true;
      }),
      findDueDeliveries: mock(async () => [confirmationRef]),
    };
    const usedKeys: string[] = [];
    const send = mock(async (_ref: OrderEmailRef, key: string) => {
      usedKeys.push(key);

      if (usedKeys.length === 1) {
        throw new Error("Temporary network failure");
      }

      return "email_123";
    });

    const first = await attemptOrderEmailDelivery(confirmationRef, repository, send);
    const retry = await deliverDueOrderEmails(repository, send);

    expect(first).toMatchObject({ status: "failed", terminal: false });
    expect(retry).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(failedAttempts).toEqual([1]);
    expect(completedAttempts).toEqual([2]);
    expect(usedKeys).toEqual([idempotencyKey, idempotencyKey]);
  });

  test("does not send again after a successful delivery claim is no longer available", async () => {
    let available = true;
    const repository: OrderEmailDeliveryRepository = {
      claimDelivery: mock(async () => {
        if (!available) {
          return null;
        }

        available = false;
        return {
          id: "delivery_123",
          orderId: delivery.orderId,
          kind: "confirmation" as const,
          idempotencyKey: delivery.idempotencyKey,
          attemptCount: 1,
        };
      }),
      markDelivered: mock(async () => true),
      markFailed: mock(async () => true),
      findDueDeliveries: mock(async () => []),
    };
    const send = mock(async () => "email_123");

    expect(
      await attemptOrderEmailDelivery(confirmationRef, repository, send, { force: true }),
    ).toEqual({ status: "sent" });
    expect(
      await attemptOrderEmailDelivery(confirmationRef, repository, send, { force: true }),
    ).toEqual({ status: "skipped" });
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe("delivery-scheduled template", () => {
  test("renders the drop-off address, the arranging note, and the contents", async () => {
    const html = await render(
      createElement(DeliveryScheduledEmail, {
        order: deliveryScheduledView,
        supportEmail: "support@example.com",
      }),
    );

    expect(html).toContain("FHQ-20260713-ABC12345");
    expect(html).toContain("Delivering to");
    expect(html).toContain("123 Test Street");
    expect(html).toContain("arrange a delivery day and time");
    expect(html).toContain("Database Deck");
    expect(html).toContain("support@example.com");
    // Nothing is owed on drop-off, so no shipping or balance-due language belongs here.
    expect(html).not.toContain("Shipping");
    expect(html).not.toContain(delivery.orderId);
  });

  test("omits the address section when no address was recorded", async () => {
    const html = await render(
      createElement(DeliveryScheduledEmail, {
        order: { ...deliveryScheduledView, deliveryAddressLines: [] },
        supportEmail: "support@example.com",
      }),
    );

    expect(html).not.toContain("Delivering to");
    expect(html).toContain("arrange a delivery day and time");
  });
});

describe("delivery confirmation template", () => {
  test("shows the address as a drop-off with the arranging note", async () => {
    const html = await render(
      createElement(OrderConfirmationEmail, {
        order: {
          ...delivery.order,
          shippingCents: 0,
          isLocalDelivery: true,
        },
        supportEmail: "support@example.com",
      }),
    );

    expect(html).toContain("Delivering to");
    expect(html).toContain("123 Test Street");
    // The charge line reads "Delivery / Free"; the old method label must not resurface.
    expect(html).toContain("Delivery");
    expect(html).toContain("Free");
    expect(html).not.toContain("Pickup");
    expect(html).toContain("arrange a delivery time");
    expect(html).not.toContain("Shipping to");
  });

  test("still identifies a delivery order when no address was recorded", async () => {
    const html = await render(
      createElement(OrderConfirmationEmail, {
        order: {
          ...delivery.order,
          shippingCents: 0,
          shippingAddressLines: [],
          isLocalDelivery: true,
        },
        supportEmail: "support@example.com",
      }),
    );

    // The receipt still goes out, and still tells the customer this is a delivery order rather
    // than silently omitting every fulfillment detail.
    expect(html).toContain("Delivering to");
    expect(html).toContain("arrange a delivery time");
    expect(html).not.toContain("Shipping to");
  });
});

describe("order email idempotency keys", () => {
  test("gives every kind its own stable key for one order", () => {
    const orderId = delivery.orderId;

    // Pre-existing rows were sent under these exact keys; they must not change.
    expect(makeOrderEmailIdempotencyKey(orderId, "confirmation")).toBe(
      `order-confirmation/${orderId}`,
    );
    expect(makeOrderEmailIdempotencyKey(orderId, "delivery_scheduled")).toBe(
      `order-delivery-scheduled/${orderId}`,
    );
    expect(makeOrderEmailIdempotencyKey(orderId, "shipped")).toBe(`order-shipped/${orderId}`);

    const keys = orderEmailKindValues.map((kind) => makeOrderEmailIdempotencyKey(orderId, kind));
    expect(new Set(keys).size).toBe(orderEmailKindValues.length);
  });
});

describe("shipped template", () => {
  test("renders the carrier, a tracking link, the destination, and the contents", async () => {
    const html = await render(
      createElement(OrderShippedEmail, {
        order: shippedView,
        supportEmail: "support@example.com",
      }),
    );

    expect(html).toContain("FHQ-20260713-ABC12345");
    expect(html).toContain("Canada Post");
    expect(html).toContain("1234 5678 9123 4567");
    expect(html).toContain("Track this shipment");
    expect(html).toContain("canadapost-postescanada.ca");
    expect(html).toContain("123 Test Street");
    expect(html).toContain("Database Deck");
    expect(html).toContain("support@example.com");
    // The confirmation email is the receipt; repeating money here reads as a second charge.
    expect(html).not.toContain("$104.00");
    expect(html).not.toContain(delivery.orderId);
  });

  test("still notifies the customer when the shipment has no tracking number", async () => {
    const html = await render(
      createElement(OrderShippedEmail, {
        order: { ...shippedView, tracking: null },
        supportEmail: "support@example.com",
      }),
    );

    expect(html).toContain("Your order is on its way.");
    expect(html).toContain("does not have a tracking number");
    expect(html).not.toContain("Track this shipment");
    expect(html).not.toContain("1234 5678 9123 4567");
  });

  test("renders an unlinkable carrier's number as plain text", async () => {
    const html = await render(
      createElement(OrderShippedEmail, {
        order: {
          ...shippedView,
          tracking: {
            carrierName: getShippingCarrierLabel("other"),
            trackingNumber: "ABC123",
            trackingUrl: getShippingCarrierTrackingUrl("other", "ABC123"),
          },
        },
        supportEmail: "support@example.com",
      }),
    );

    expect(html).toContain("Other carrier");
    expect(html).toContain("ABC123");
    expect(html).not.toContain("Track this shipment");
  });
});

describe("carrier tracking links", () => {
  test("builds a per-carrier tracking URL and escapes the number", () => {
    expect(getShippingCarrierTrackingUrl("ups", "1Z999AA10123456784")).toBe(
      "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    );
    expect(getShippingCarrierTrackingUrl("canada_post", "1234 5678 9123 4567")).toContain(
      "1234%205678%209123%204567",
    );
    // "Other" exists so an operator can still record a number from a carrier with no link form.
    expect(getShippingCarrierTrackingUrl("other", "ABC123")).toBeNull();

    for (const carrier of shippingCarrierValues) {
      expect(getShippingCarrierLabel(carrier).length).toBeGreaterThan(0);
    }
  });

  test("resolves an order's stored tracking columns into one renderable shape", () => {
    expect(
      resolveOrderTracking({ trackingCarrier: "ups", trackingNumber: "1Z999AA10123456784" }),
    ).toEqual({
      carrierName: "UPS",
      trackingNumber: "1Z999AA10123456784",
      trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784",
    });
    expect(resolveOrderTracking({ trackingCarrier: null, trackingNumber: null })).toBeNull();
    // Half-filled rows are barred by a check constraint, but the resolver must not render one.
    expect(resolveOrderTracking({ trackingCarrier: "ups", trackingNumber: null })).toBeNull();
    expect(resolveOrderTracking({ trackingCarrier: null, trackingNumber: "1Z999" })).toBeNull();
  });
});

describe("shipped delivery", () => {
  test("sends the shipment notice under the order's shipped idempotency key", async () => {
    let message: CreateEmailOptions | undefined;
    let idempotencyKey: string | undefined;

    const emailId = await deliverOrderShipped(
      {
        orderId: delivery.orderId,
        idempotencyKey: makeOrderEmailIdempotencyKey(delivery.orderId, "shipped"),
        recipientEmail: "skater@example.com",
        order: shippedView,
      },
      { from: "Fuckers Skateboards <orders@example.com>", supportEmail: "support@example.com" },
      {
        send: async (input, options) => {
          message = input;
          idempotencyKey = options.idempotencyKey;
          return { data: { id: "email_456" }, error: null, headers: null };
        },
      },
    );

    expect(emailId).toBe("email_456");
    expect(message).toMatchObject({
      to: "skater@example.com",
      replyTo: "support@example.com",
      subject: "Order FHQ-20260713-ABC12345 is on its way",
    });
    expect(idempotencyKey).toBe(`order-shipped/${delivery.orderId}`);
  });

  test("turns Resend API errors into catchable delivery errors", async () => {
    await expect(
      deliverOrderShipped(
        {
          orderId: delivery.orderId,
          idempotencyKey: makeOrderEmailIdempotencyKey(delivery.orderId, "shipped"),
          recipientEmail: "skater@example.com",
          order: shippedView,
        },
        { from: "Fuckers Skateboards <orders@example.com>", supportEmail: "support@example.com" },
        {
          send: async () => ({
            data: null,
            error: { message: "Rate limited.", name: "rate_limit_exceeded", statusCode: 429 },
            headers: null,
          }),
        },
      ),
    ).rejects.toThrow(OrderEmailDeliveryError);
  });

  test("retries the shipping email independently of the other order emails", async () => {
    const claimed: OrderEmailRef[] = [];
    const repository: OrderEmailDeliveryRepository = {
      claimDelivery: mock(async (ref) => {
        claimed.push(ref);
        return {
          id: `delivery_${ref.kind}`,
          orderId: ref.orderId,
          kind: ref.kind,
          idempotencyKey: makeOrderEmailIdempotencyKey(ref.orderId, ref.kind),
          attemptCount: 1,
        };
      }),
      markDelivered: mock(async () => true),
      markFailed: mock(async () => true),
      findDueDeliveries: mock(async () => [shippedRef]),
    };
    const sent: Array<{ kind: string; key: string }> = [];

    expect(
      await deliverDueOrderEmails(repository, async (ref, key) => {
        sent.push({ kind: ref.kind, key });
        return "email_456";
      }),
    ).toEqual({ attempted: 1, sent: 1, failed: 0 });
    expect(claimed).toEqual([shippedRef]);
    expect(sent).toEqual([{ kind: "shipped", key: `order-shipped/${delivery.orderId}` }]);
  });
});

describe("delivery-scheduled outbox", () => {
  test("retries the delivery email independently of the confirmation email", async () => {
    const claimed: OrderEmailRef[] = [];
    const repository: OrderEmailDeliveryRepository = {
      claimDelivery: mock(async (ref) => {
        claimed.push(ref);
        return {
          id: `delivery_${ref.kind}`,
          orderId: ref.orderId,
          kind: ref.kind,
          idempotencyKey: makeOrderEmailIdempotencyKey(ref.orderId, ref.kind),
          attemptCount: 1,
        };
      }),
      markDelivered: mock(async () => true),
      markFailed: mock(async () => true),
      findDueDeliveries: mock(async () => [deliveryScheduledRef]),
    };
    const sent: Array<{ kind: string; key: string }> = [];
    const send = mock(async (ref: OrderEmailRef, key: string) => {
      sent.push({ kind: ref.kind, key });
      return "email_123";
    });

    expect(await deliverDueOrderEmails(repository, send)).toEqual({
      attempted: 1,
      sent: 1,
      failed: 0,
    });
    expect(claimed).toEqual([deliveryScheduledRef]);
    expect(sent).toEqual([
      { kind: "delivery_scheduled", key: `order-delivery-scheduled/${delivery.orderId}` },
    ]);
  });

  test("defers a delivery email blocked by an email configuration gap", async () => {
    const repository: OrderEmailDeliveryRepository = {
      claimDelivery: mock(async (ref) => ({
        id: "delivery_scheduled_row",
        orderId: ref.orderId,
        kind: ref.kind,
        idempotencyKey: makeOrderEmailIdempotencyKey(ref.orderId, ref.kind),
        attemptCount: 1,
      })),
      markDelivered: mock(async () => true),
      markFailed: mock(async (attempt) => {
        // Misconfiguration is operator-fixable, so the row stays retryable rather than failing out.
        expect(attempt.errorCode).toBe("configuration_error");
        expect(attempt.terminal).toBe(false);
        return true;
      }),
      findDueDeliveries: mock(async () => []),
    };

    expect(
      await attemptOrderEmailDelivery(deliveryScheduledRef, repository, async () => {
        throw new Error("EMAIL_FROM is required.");
      }),
    ).toMatchObject({ status: "failed", terminal: false });
    expect(repository.markFailed).toHaveBeenCalledTimes(1);
  });
});
