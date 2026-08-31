import { afterEach, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { VariantPicker } from "@/components/shop/variant-picker";
import type { CatalogProduct } from "@/lib/catalog/queries";

const product: CatalogProduct = {
  id: "f3da88cf-33c1-4691-b0aa-15ea08fbb173",
  slug: "database-deck",
  name: "Database Deck",
  description: "A deck for testing",
  category: "hardgoods",
  subcategory: "decks",
  createdAt: new Date("2026-07-26T00:00:00.000Z"),
  updatedAt: new Date("2026-07-26T00:00:00.000Z"),
  variants: [
    {
      id: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
      name: '8.25"',
      sku: "DATABASE-825",
      priceCents: 8_900,
      inventoryQty: 10,
      reservedQty: 0,
      availableQty: 10,
    },
    {
      id: "b9dc5f73-c444-4c4e-b606-a645397c93d3",
      name: '9"',
      sku: "DATABASE-900",
      priceCents: 9_200,
      inventoryQty: 0,
      reservedQty: 0,
      availableQty: 0,
    },
  ],
  images: [],
  minPriceCents: 8_900,
  maxPriceCents: 9_200,
  totalInventoryQty: 10,
};

afterEach(cleanup);

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

test("uses the stock-count space for quantity and hides ordinary availability counts", () => {
  const markup = renderToStaticMarkup(<VariantPicker product={product} />);

  expect(markup).toContain('class="flex items-center justify-between gap-4"');
  expect(markup).toContain(">Quantity</span>");
  expect(markup).toContain('aria-label="Quantity for 8.25&quot;"');
  expect(markup).not.toContain("10 available");
  expect(markup).not.toContain("Only 10 left");
});

test("shows the selected variant count only when stock is low", () => {
  const lowStockProduct = {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      inventoryQty: 3,
      availableQty: 3,
    })),
  };

  const markup = renderToStaticMarkup(<VariantPicker product={lowStockProduct} />);

  expect(markup).toContain("Only 3 left");
});

test("mutes an out-of-stock variant without disabling selection", () => {
  render(<VariantPicker product={product} />);

  const soldOutVariant = screen.getByRole("button", { name: '9", out of stock' });
  expect(soldOutVariant.className).toContain("bg-muted");
  expect((soldOutVariant as HTMLButtonElement).disabled).toBe(false);
  expect(soldOutVariant.getAttribute("aria-pressed")).toBe("false");

  fireEvent.click(soldOutVariant);

  expect(soldOutVariant.className).toContain("bg-muted-foreground");
  expect(soldOutVariant.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText("Out of stock")).toBeDefined();
  expect((screen.getByRole("button", { name: "Add to cart" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
