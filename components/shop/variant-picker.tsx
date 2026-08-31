"use client";

import { useMemo, useState } from "react";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { Button } from "@/components/ui/button";
import type { CatalogProduct } from "@/lib/catalog/queries";
import { LOW_STOCK_THRESHOLD } from "@/lib/catalog/stock";

import { Price } from "./price";
import { QuantityControl } from "./quantity-control";

type VariantPickerProps = {
  product: CatalogProduct;
};

/** Lets shoppers choose a product variant and quantity before adding it to the cart. */
export function VariantPicker({ product }: VariantPickerProps) {
  const firstAvailableVariant =
    product.variants.find((variant) => variant.availableQty > 0) ?? product.variants[0];
  const [variantId, setVariantId] = useState(firstAvailableVariant?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const selectedVariant = useMemo(
    () => product.variants.find((variant) => variant.id === variantId) ?? firstAvailableVariant,
    [firstAvailableVariant, product.variants, variantId],
  );
  const imageUrl = product.images[0]?.url ?? null;
  const maxQuantity = Math.max(1, Math.min(selectedVariant?.availableQty ?? 1, 99));
  const isUnavailable = !selectedVariant || selectedVariant.availableQty <= 0;
  const availabilityMessage = !selectedVariant
    ? null
    : isUnavailable
      ? "Out of stock"
      : selectedVariant.availableQty <= LOW_STOCK_THRESHOLD
        ? `Only ${selectedVariant.availableQty} left`
        : null;

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="space-y-3">
        <p className="font-semibold text-sm">Variant</p>
        <div className="flex flex-wrap gap-2">
          {product.variants.map((variant) => {
            const isSelected = variant.id === selectedVariant?.id;
            const isOutOfStock = variant.availableQty <= 0;

            return (
              <Button
                aria-label={isOutOfStock ? `${variant.name}, out of stock` : variant.name}
                aria-pressed={isSelected}
                className={
                  isOutOfStock
                    ? isSelected
                      ? "bg-muted-foreground text-background hover:bg-muted-foreground/90 hover:text-background"
                      : "border-muted bg-muted text-muted-foreground hover:bg-muted/80 hover:text-muted-foreground"
                    : undefined
                }
                key={variant.id}
                onClick={() => {
                  setVariantId(variant.id);
                  setQuantity(1);
                }}
                type="button"
                variant={isSelected ? "default" : "outline"}
              >
                {variant.name}
              </Button>
            );
          })}
        </div>
      </div>
      {selectedVariant ? (
        <div className="space-y-4">
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-grotesk font-semibold text-2xl">
                  <Price cents={selectedVariant.priceCents} />
                </p>
                {availabilityMessage ? (
                  <p
                    className={`mt-1 font-semibold text-sm ${isUnavailable ? "text-destructive" : "text-amber-800"}`}
                  >
                    {availabilityMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-sm">Quantity</span>
                <QuantityControl
                  label={selectedVariant.name}
                  max={maxQuantity}
                  onChange={setQuantity}
                  value={quantity}
                />
              </div>
            </div>
          </div>
          <AddToCartButton
            disabled={isUnavailable}
            line={{
              variantId: selectedVariant.id,
              quantity,
              productName: product.name,
              variantName: selectedVariant.name,
              priceCents: selectedVariant.priceCents,
              imageUrl,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
