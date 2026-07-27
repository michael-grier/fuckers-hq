import { expect, test } from "bun:test";
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
  ],
  images: [],
  minPriceCents: 8_900,
  maxPriceCents: 8_900,
  totalInventoryQty: 10,
};

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

test("keeps the quantity control and Add to cart button within separate desktop columns", () => {
  const markup = renderToStaticMarkup(<VariantPicker product={product} />);

  expect(markup).toContain(
    'class="flex flex-col gap-4 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"',
  );
});
