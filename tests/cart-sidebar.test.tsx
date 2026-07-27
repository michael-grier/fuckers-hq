import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { CartSidebar, CartSidebarContent } from "@/components/cart/cart-sidebar";
import { SiteHeader } from "@/components/shop/site-header";
import { Sheet } from "@/components/ui/sheet";
import type { CartDisplayLine } from "@/lib/cart/types";

const deck: CartDisplayLine = {
  variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
  quantity: 2,
  productName: "Database Deck",
  variantName: '8.25"',
  priceCents: 8_900,
  imageUrl: null,
};

describe("cart sidebar", () => {
  test("uses the header cart action as the sheet trigger", () => {
    const markup = renderToStaticMarkup(
      <CartSidebar>
        <SiteHeader />
      </CartSidebar>,
    );

    expect(markup).toContain('data-slot="sheet-trigger"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain('href="/cart"');
  });

  test("renders an empty state that closes without navigating", () => {
    const markup = renderToStaticMarkup(
      <Sheet>
        <CartSidebarContent lines={[]} onClear={() => undefined} />
      </Sheet>,
    );

    expect(markup).toContain("Your cart is empty.");
    expect(markup).toContain("Ready when you are.");
    expect(markup).toContain("Continue shopping");
    expect(markup).not.toContain('href="/products"');
    expect(markup).not.toContain("Checkout");
  });

  test("renders compact editable lines and both checkout paths", () => {
    const markup = renderToStaticMarkup(
      <Sheet>
        <CartSidebarContent lines={[deck]} onClear={() => undefined} />
      </Sheet>,
    );

    expect(markup).toContain("2 items. Update your cart or continue to checkout.");
    expect(markup).toContain("Clear cart");
    expect(markup).toContain("Decrease quantity for Database Deck");
    expect(markup).toContain('aria-label="Quantity for Database Deck');
    expect(markup).toContain("Remove Database Deck");
    expect(markup).toContain("Checkout");
    expect(markup).toContain('href="/cart">View cart</a>');
  });
});
