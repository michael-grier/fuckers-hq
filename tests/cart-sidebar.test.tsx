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
    // The sheet already closes via its X and backdrop, so the footer does not repeat that
    // affordance and spend vertical space the item list needs on short viewports.
    expect(markup).not.toContain("Continue shopping");
  });

  test("keeps the header clear of the absolute close button at every breakpoint", () => {
    const markup = renderToStaticMarkup(
      <Sheet>
        <CartSidebarContent lines={[deck]} onClear={() => undefined} />
      </Sheet>,
    );

    const header = markup.match(/<div class="([^"]*)" data-slot="sheet-header"/)?.[1] ?? "";

    // sm:px-6 would otherwise reset pr-14 and slide "Clear cart" under the X.
    expect(header).toContain("pr-14");
    expect(header).toContain("sm:pr-14");
  });

  test("offers pickup as a compact segmented control, address not inflating the footer", () => {
    const markup = renderToStaticMarkup(
      <Sheet>
        <CartSidebarContent
          lines={[deck]}
          onClear={() => undefined}
          pickupLocation={{
            name: "The Shop",
            address: "123 Test Street\nCalgary, AB T1T 1T1",
            hours: "Wed-Sun, 11am-6pm",
            instructions: "Ring the buzzer.",
          }}
        />
      </Sheet>,
    );

    expect(markup).toContain("How do you want it?");
    expect(markup).toContain("Ship it");
    expect(markup).toContain("Local pickup");
    // Real radios keep arrow-key navigation working even though the control looks segmented.
    expect(markup).toContain('type="radio"');
    // The footer never carries the street address at rest; it lives behind a disclosure that
    // only appears once pickup is chosen. Zustand serves its initial state to SSR, so that
    // selected branch is only reachable in a browser, not in static markup.
    expect(markup).not.toContain("123 Test Street");
    expect(markup).not.toContain("Ring the buzzer.");
  });

  test("omits the picker entirely when pickup is not configured", () => {
    const markup = renderToStaticMarkup(
      <Sheet>
        <CartSidebarContent lines={[deck]} onClear={() => undefined} />
      </Sheet>,
    );

    expect(markup).not.toContain("How do you want it?");
  });
});
