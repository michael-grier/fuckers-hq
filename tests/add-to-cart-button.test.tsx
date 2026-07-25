import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";

test("renders Add to cart as an enabled, clickable button", () => {
  const markup = renderToStaticMarkup(
    <AddToCartButton
      line={{
        variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
        productName: "Database Deck",
        variantName: '8.25"',
        priceCents: 8_900,
        imageUrl: null,
      }}
    />,
  );

  expect(markup).toContain("<button");
  expect(markup).toContain("cursor-pointer");
  expect(markup).toContain('aria-live="polite"');
  expect(markup).toContain("Add to cart");
  expect(markup).not.toContain(' disabled=""');
});
