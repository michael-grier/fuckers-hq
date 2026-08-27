import { afterEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FulfillmentPicker } from "@/components/cart/fulfillment-picker";
import { useCartStore } from "@/lib/cart/store";
import type { CartDisplayLine } from "@/lib/cart/types";

const line: CartDisplayLine = {
  variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
  quantity: 1,
  productName: "Database Deck",
  variantName: '8.25"',
  priceCents: 8_900,
  imageUrl: null,
};
const deliveryArea = {
  areaName: "Rocky View County, Alberta",
  instructions: null,
};
const originalFetch = globalThis.fetch;

function StoreBackedPicker() {
  const lines = useCartStore((state) => state.lines);

  return <FulfillmentPicker compact deliveryArea={deliveryArea} lines={lines} />;
}

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  useCartStore.setState({
    lines: [],
    fulfillmentMethod: "shipping",
    deliveryEligibility: null,
  });
});

describe("fulfillment picker", () => {
  test("shows the sidebar form behind a collapsed native disclosure", () => {
    const { container } = render(
      <FulfillmentPicker compact deliveryArea={deliveryArea} lines={[line]} />,
    );

    expect(screen.getByText("Check free local delivery")).toBeDefined();
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.queryByRole("radio", { name: "Local delivery" })).toBeNull();
  });

  test("replaces a successful check with a compact verified choice", async () => {
    const fetchMock = mock(async () =>
      Response.json({
        status: "eligible",
        token: "signed-delivery-token",
        address: { line1: "262075 Rocky View Point", postalCode: "T4A0X2" },
        reviewRequired: false,
        message: "Free local delivery is available for this address.",
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    useCartStore.setState({ lines: [line] });
    render(<FulfillmentPicker compact deliveryArea={deliveryArea} lines={[line]} />);

    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "262075 Rocky View Point" },
    });
    fireEvent.change(screen.getByLabelText("Postal code"), {
      target: { value: "T4A 0X2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check address" }));

    await waitFor(() => {
      expect(screen.getByText("Free local delivery available")).toBeDefined();
    });
    expect(
      (screen.getByRole("radio", { name: "Local delivery" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByRole("button", { name: "Check address" })).toBeNull();
    expect(useCartStore.getState().deliveryEligibility?.token).toBe("signed-delivery-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    await waitFor(() => {
      expect(document.querySelector("details")?.open).toBe(true);
    });
    expect(useCartStore.getState().deliveryEligibility).toBeNull();
  });

  test("keeps shipping selected when the geocoder is unavailable", async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        status: "unavailable",
        message: "We couldn't check local delivery right now. Shipping is still available.",
      }),
    ) as unknown as typeof fetch;
    render(<FulfillmentPicker compact deliveryArea={deliveryArea} lines={[line]} />);

    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "262075 Rocky View Point" },
    });
    fireEvent.change(screen.getByLabelText("Postal code"), {
      target: { value: "T4A 0X2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check address" }));

    expect(await screen.findByText(/Shipping is still available/)).toBeDefined();
    expect((screen.getByRole("radio", { name: "Ship it" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole("radio", { name: "Local delivery" })).toBeNull();
  });

  test("ignores a successful response when the cart changed during the check", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    globalThis.fetch = mock(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    ) as unknown as typeof fetch;
    useCartStore.setState({ lines: [line] });
    render(<StoreBackedPicker />);

    fireEvent.change(screen.getByLabelText("Street address"), {
      target: { value: "262075 Rocky View Point" },
    });
    fireEvent.change(screen.getByLabelText("Postal code"), {
      target: { value: "T4A 0X2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check address" }));
    act(() => useCartStore.getState().removeLine(line.variantId));
    await act(async () => {
      resolveFetch?.(
        Response.json({
          status: "eligible",
          token: "obsolete-signed-token",
          address: { line1: "262075 Rocky View Point", postalCode: "T4A0X2" },
          reviewRequired: false,
          message: "Free local delivery is available for this address.",
        }),
      );
    });

    expect(screen.queryByText(/Free local delivery is available/)).toBeNull();
    expect(useCartStore.getState().deliveryEligibility).toBeNull();
    expect(useCartStore.getState().fulfillmentMethod).toBe("shipping");
  });

  test("explains the amount remaining instead of showing an address form below $30", () => {
    render(
      <FulfillmentPicker
        compact
        deliveryArea={deliveryArea}
        lines={[{ ...line, priceCents: 500 }]}
      />,
    );

    expect(screen.getByText(/Add \$25.00 more/)).toBeDefined();
    expect(screen.queryByLabelText("Street address")).toBeNull();
  });
});
