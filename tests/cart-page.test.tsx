import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CartPageClient, CartPageContent } from "@/components/cart/cart-page-client";
import type { CartDisplayLine } from "@/lib/cart/types";

const deck: CartDisplayLine = {
  variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
  quantity: 2,
  productName: "Database Deck",
  variantName: '8.25"',
  priceCents: 8_900,
  imageUrl: null,
};

describe("cart page", () => {
  // Returning from Stripe's hosted checkout is a full document load, so this server markup is what
  // the shopper stares at until the bundle rehydrates the persisted cart.
  test("renders a loading skeleton instead of the empty state before the cart hydrates", () => {
    const markup = renderToStaticMarkup(<CartPageClient deliveryArea={null} />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("Loading your cart.");
    expect(markup).toContain("animate-pulse");
    expect(markup).not.toContain("Your cart is empty");
    expect(markup).not.toContain("Continue shopping");
  });

  test("renders the empty state once a hydrated cart really is empty", () => {
    const markup = renderToStaticMarkup(
      <CartPageContent lines={[]} onClear={() => undefined} deliveryArea={null} />,
    );

    expect(markup).toContain("Your cart is empty");
    expect(markup).toContain("Continue shopping");
    expect(markup).toContain('href="/products"');
    expect(markup).not.toContain("animate-pulse");
  });

  test("renders stocked lines with the checkout column", () => {
    const markup = renderToStaticMarkup(
      <CartPageContent lines={[deck]} onClear={() => undefined} deliveryArea={null} />,
    );

    expect(markup).toContain("Database Deck");
    expect(markup).toContain("Clear cart");
    expect(markup).toContain("Checkout");
    expect(markup).not.toContain("Your cart is empty");
    expect(markup).not.toContain('role="status"');
  });

  test("offers the delivery choice when a delivery area is configured", () => {
    const markup = renderToStaticMarkup(
      <CartPageContent
        deliveryArea={{ areaName: "Rocky View County, Alberta", instructions: null }}
        lines={[deck]}
        onClear={() => undefined}
      />,
    );

    expect(markup).toContain("How do you want it?");
    expect(markup).toContain("Local delivery");
    expect(markup).toContain("Rocky View County, Alberta");
  });
});
