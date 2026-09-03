import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ActionResult } from "@/lib/actions/result";

let actionResult: ActionResult = { success: true, data: undefined };
let actionError: Error | null = null;
let refreshCount = 0;
const savedPayloads: Array<Record<string, unknown>> = [];

mock.module("next/navigation", () => ({
  useRouter: () => ({
    refresh: () => {
      refreshCount += 1;
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
  usePathname: () => "/admin/orders/order-id",
  useSearchParams: () => new URLSearchParams(),
}));

mock.module("@/lib/actions/orders", () => ({
  markOrderAsShipped: async () => ({ success: true, data: undefined }) as const,
  markOrderDelivered: async () => ({ success: true, data: undefined }) as const,
  retryOrderEmail: async () => ({ success: true, data: undefined }) as const,
  retryOrderInventoryAllocation: async () => ({ success: true, data: undefined }) as const,
  returnOrderInventoryToStock: async () => ({ success: true, data: undefined }) as const,
  scheduleOrderDelivery: async () => ({ success: true, data: undefined }) as const,
  updateOrderShippingRecord: async (input: Record<string, unknown>) => {
    savedPayloads.push(input);

    if (actionError) {
      throw actionError;
    }

    return actionResult;
  },
}));

const { ShippingRecordEditor } = await import("@/components/admin/shipping-record-editor");

const defaultProps = {
  actualCostCents: 1_425,
  actualCostUnknown: false,
  currency: "cad",
  orderId: "823071ff-f180-43ed-82df-af334ccfe35a",
  packedWeightGrams: 780,
  packedWeightUnknown: false,
  shippingChargedCents: 1_500,
};

beforeEach(() => {
  actionResult = { success: true, data: undefined };
  actionError = null;
  refreshCount = 0;
  savedPayloads.length = 0;
});

afterEach(cleanup);

describe("shipping record editor", () => {
  test("shows the saved parcel facts, flat-rate difference, and operator guidance", () => {
    render(<ShippingRecordEditor {...defaultProps} />);

    expect(screen.getByText("Complete")).toBeDefined();
    expect(screen.getByText(/Customer charged \$15.00 for shipping/)).toBeDefined();
    expect(screen.getByText(/\$0.75 above carrier cost/)).toBeDefined();
    expect(screen.getByText(/Why track this/)).toBeDefined();
    expect((screen.getByLabelText("Actual carrier cost") as HTMLInputElement).value).toBe("14.25");
    expect((screen.getByLabelText("Packed weight") as HTMLInputElement).value).toBe("780");
  });

  test("marks unavailable values unknown instead of submitting empty pending fields", async () => {
    render(
      <ShippingRecordEditor {...defaultProps} actualCostCents={null} packedWeightGrams={null} />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "Carrier cost unknown" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Packed weight unknown" }));
    fireEvent.click(screen.getByRole("button", { name: "Save shipping record" }));

    await waitFor(() => expect(savedPayloads).toHaveLength(1));
    expect(savedPayloads[0]).toEqual({
      orderId: defaultProps.orderId,
      actualCostDollars: "",
      actualCostUnknown: true,
      packedWeightGrams: "",
      packedWeightUnknown: true,
    });
    expect(screen.getByRole("status").textContent).toBe("Shipping record saved.");
    expect(refreshCount).toBe(1);
  });

  test("keeps incomplete and malformed values out of the server action", async () => {
    render(
      <ShippingRecordEditor {...defaultProps} actualCostCents={null} packedWeightGrams={null} />,
    );

    fireEvent.change(screen.getByLabelText("Actual carrier cost"), {
      target: { value: "12.345" },
    });
    fireEvent.change(screen.getByLabelText("Packed weight"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save shipping record" }));

    await waitFor(() => {
      expect(
        screen.getByText("Use a non-negative dollar amount with no more than two decimals."),
      ).toBeDefined();
    });
    expect(screen.getByText("Use a positive whole number of grams.")).toBeDefined();
    expect(savedPayloads).toHaveLength(0);
  });

  test("shows server field errors and retryable failures", async () => {
    actionResult = {
      success: false,
      message: "Please correct the highlighted fields.",
      fieldErrors: { actualCostDollars: ["That carrier cost is unavailable."] },
    };
    const { unmount } = render(<ShippingRecordEditor {...defaultProps} />);

    fireEvent.change(screen.getByLabelText("Actual carrier cost"), {
      target: { value: "15.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save shipping record" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Please correct the highlighted fields.");
    });
    expect(screen.getByText("That carrier cost is unavailable.")).toBeDefined();
    unmount();

    actionResult = { success: true, data: undefined };
    actionError = new Error("Database unavailable");
    render(<ShippingRecordEditor {...defaultProps} />);
    fireEvent.change(screen.getByLabelText("Packed weight"), { target: { value: "800" } });
    fireEvent.click(screen.getByRole("button", { name: "Save shipping record" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "The shipping record could not be saved. Try again shortly.",
      );
    });
  });
});
