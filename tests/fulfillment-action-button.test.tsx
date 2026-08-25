import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
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
  scheduleOrderDelivery: async () => ({ success: true, data: undefined }) as const,
}));

const { FulfillmentActionButton } = await import("@/components/admin/fulfillment-action-button");

beforeEach(() => {
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
