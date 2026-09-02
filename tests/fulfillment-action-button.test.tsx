import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { PeekableOrder } from "@/components/admin/order-peek";

const adminRouteRefreshes: true[] = [];

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      adminRouteRefreshes.push(true);
    },
    push: () => {},
    replace: () => {},
  }),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
  usePathname: () => "/admin/orders",
  useSearchParams: () => new URLSearchParams(),
}));

const submittedShipments: Array<Record<string, unknown>> = [];

mock.module("@/lib/actions/orders", () => ({
  markOrderAsShipped: async (input: Record<string, unknown>) => {
    submittedShipments.push(input);
    return { success: true, data: undefined } as const;
  },
  markOrderDelivered: async () => ({ success: true, data: undefined }) as const,
  retryOrderEmail: async () => ({ success: true, data: undefined }) as const,
  retryOrderInventoryAllocation: async () => ({ success: true, data: undefined }) as const,
  returnOrderInventoryToStock: async () => ({ success: true, data: undefined }) as const,
  scheduleOrderDelivery: async () => ({ success: true, data: undefined }) as const,
}));

const { FulfillmentActionButton } = await import("@/components/admin/fulfillment-action-button");
const { OrderPeek } = await import("@/components/admin/order-peek");
const { ReturnOrderInventoryButton } = await import(
  "@/components/admin/return-order-inventory-button"
);

beforeEach(() => {
  adminRouteRefreshes.length = 0;
  submittedShipments.length = 0;
});

afterEach(cleanup);

function openShipmentForm() {
  render(
    <FulfillmentActionButton orderId="823071ff-f180-43ed-82df-af334ccfe35a" transition="ship" />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Mark as shipped" }));

  return {
    carrier: screen.getByLabelText("Carrier") as HTMLSelectElement,
    trackingNumber: screen.getByLabelText("Tracking number") as HTMLInputElement,
  };
}

describe("shipment tracking form", () => {
  test("offers only Canada Post for a tracked shipment", () => {
    const { carrier } = openShipmentForm();

    expect([...carrier.options].map((option) => option.text)).toEqual([
      "No tracking number",
      "Canada Post",
    ]);
  });

  test("shows an accessible field error before submitting an invalid number", () => {
    const { carrier, trackingNumber } = openShipmentForm();

    fireEvent.change(carrier, { target: { value: "canada_post" } });
    fireEvent.change(trackingNumber, { target: { value: "CX473124828CA" } });
    fireEvent.click(screen.getByRole("button", { name: "Ship and notify" }));

    const error = screen.getByText(
      "Enter a 16-digit Canada Post tracking number or a 13-character number with 2 letters, 9 digits, and CA.",
    );

    expect(trackingNumber.getAttribute("aria-invalid")).toBe("true");
    expect(trackingNumber.getAttribute("aria-describedby")).toBe(error.id);
    expect(submittedShipments).toHaveLength(0);
  });

  test("submits a checksum-valid S10 number", async () => {
    const { carrier, trackingNumber } = openShipmentForm();

    fireEvent.change(carrier, { target: { value: "canada_post" } });
    fireEvent.change(trackingNumber, { target: { value: "CX473124829CA" } });
    fireEvent.click(screen.getByRole("button", { name: "Ship and notify" }));

    await waitFor(() => {
      expect(submittedShipments).toEqual([
        {
          orderId: "823071ff-f180-43ed-82df-af334ccfe35a",
          trackingCarrier: "canada_post",
          trackingNumber: "CX473124829CA",
        },
      ]);
    });
  });
});

describe("return order inventory button", () => {
  test("stays disabled while the refreshed order state is loading", async () => {
    render(
      <ReturnOrderInventoryButton itemCount={1} orderId="823071ff-f180-43ed-82df-af334ccfe35a" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Return 1 unit to stock" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, return to stock" }));

    await waitFor(() => expect(adminRouteRefreshes).toHaveLength(1));

    const pendingButton = screen.getByRole("button", { name: "Returning…" });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Return 1 unit to stock" })).toBeNull();
  });
});

describe("order preview shipment layout", () => {
  test("keeps the open shipment form on its own row above the full-order link", () => {
    const order = {
      id: "823071ff-f180-43ed-82df-af334ccfe35a",
      orderNumber: "FHQ-TEST-ORDER",
      email: "rider@example.com",
      status: "paid",
      inventoryStatus: "allocated",
      fulfillmentMethod: "shipping",
      deliveryReviewStatus: null,
      deliveryScheduledAt: null,
      shippedAt: null,
      trackingCarrier: null,
      trackingNumber: null,
      stripeSessionId: "cs_test_order",
      stripePaymentIntentId: "pi_test_order",
      refundStatus: "none",
      refundedCents: 0,
      disputeStatus: "none",
      subtotalCents: 4900,
      taxCents: 0,
      shippingCents: 0,
      totalCents: 4900,
      currency: "cad",
      shippingAddress: null,
      destinationProvince: null,
      createdAt: new Date("2026-08-25T12:00:00.000Z"),
      items: [
        {
          id: "16bb8932-22f8-43cf-9dfe-482677f3f952",
          orderId: "823071ff-f180-43ed-82df-af334ccfe35a",
          variantId: null,
          productNameSnapshot: "Test deck",
          variantNameSnapshot: "8.25",
          unitPriceCentsSnapshot: 4900,
          quantity: 1,
        },
      ],
      adminNewOrderDelivery: null,
      confirmationDelivery: null,
      deliveryScheduledDelivery: null,
      shippedDelivery: null,
      shippingPaymentDelivery: null,
      refundDeliveries: [],
      shippingPaymentRequest: null,
      shippingPaymentRequests: [],
    } satisfies PeekableOrder;

    render(<OrderPeek order={order} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark as shipped" }));

    const formParent = screen.getByLabelText("Carrier").closest("form")?.parentElement;

    expect(formParent?.classList.contains("[&>form]:w-full")).toBe(true);
    expect(formParent?.classList.contains("[&>form]:shrink-0")).toBe(true);
    expect(formParent?.querySelector('a[href*="/admin/orders/"]')?.textContent).toContain(
      "Open full order",
    );
  });
});
