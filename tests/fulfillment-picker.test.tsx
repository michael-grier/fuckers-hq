import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { CheckoutButton } from "@/components/cart/checkout-button";
import { FulfillmentPicker } from "@/components/cart/fulfillment-picker";
import { useCartStore } from "@/lib/cart/store";
import type { CartDisplayLine } from "@/lib/cart/types";

const deliveryArea = {
  areaName: "Calgary and area",
  instructions: "Leave a phone number where we can reach you.",
};

const deck: CartDisplayLine = {
  variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
  quantity: 1,
  productName: "Database Deck",
  variantName: '8.25"',
  priceCents: 8_900,
  imageUrl: null,
};

beforeEach(() => {
  useCartStore.setState({
    deliveryAddressReviewAcknowledged: false,
    fulfillmentMethod: "shipping",
    lines: [deck],
  });
});

afterEach(() => {
  cleanup();
  useCartStore.setState({
    deliveryAddressReviewAcknowledged: false,
    fulfillmentMethod: "shipping",
    lines: [],
  });
});

describe("local delivery cart controls", () => {
  test("gates sidebar checkout on the address-review acknowledgement", () => {
    render(
      <>
        <FulfillmentPicker compact deliveryArea={deliveryArea} />
        <CheckoutButton isDeliveryAvailable />
      </>,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Local delivery" }));

    expect(screen.getByText("Address review required")).toBeDefined();
    expect(screen.getByText(/secure request for the regular shipping charge/)).toBeDefined();
    const checkoutButton = screen.getByRole("button", { name: "Agree above to checkout" });
    expect((checkoutButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /I understand that my address will be reviewed/,
      }),
    );

    expect(useCartStore.getState().deliveryAddressReviewAcknowledged).toBe(true);
    expect((screen.getByRole("button", { name: "Checkout" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  test("renders the same acknowledgement inside the selected full-page option", () => {
    useCartStore.setState({ fulfillmentMethod: "delivery" });

    render(<FulfillmentPicker deliveryArea={deliveryArea} />);

    expect(screen.getByText("Address review required")).toBeDefined();
    expect(
      screen.getByText(/Free local delivery is available on orders of \$30\.00/),
    ).toBeDefined();
    expect(screen.getByText("Leave a phone number where we can reach you.")).toBeDefined();
    expect(
      screen.getByRole("checkbox", {
        name: /I understand that my address will be reviewed/,
      }),
    ).toBeDefined();
  });

  test("keeps local delivery unavailable below the merchandise minimum", () => {
    useCartStore.setState({ lines: [{ ...deck, priceCents: 2_900 }] });

    render(<FulfillmentPicker compact deliveryArea={deliveryArea} />);

    expect(
      (screen.getByRole("radio", { name: "Local delivery" }) as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.getByText(/Add \$1\.00 more for free local delivery/)).toBeDefined();
    expect(screen.queryByText("Address review required")).toBeNull();
  });
});
