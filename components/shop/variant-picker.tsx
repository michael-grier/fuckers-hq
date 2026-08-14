"use client";

import { useMemo, useState } from "react";

import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { Button } from "@/components/ui/button";
import type { CatalogProduct } from "@/lib/catalog/queries";

import { Price } from "./price";
import { QuantityControl } from "./quantity-control";

type VariantPickerProps = {
  product: CatalogProduct;
};

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

  return (
    <div className="space-y-4 lg:space-y-6">
      <div className="space-y-3">
        <p className="font-semibold text-sm">Variant</p>
        <div className="flex flex-wrap gap-2">
          {product.variants.map((variant) => (
            <Button
              key={variant.id}
              onClick={() => {
                setVariantId(variant.id);
                setQuantity(1);
              }}
              type="button"
              variant={variant.id === selectedVariant?.id ? "default" : "outline"}
            >
              {variant.name}
            </Button>
          ))}
        </div>
      </div>
      {selectedVariant ? (
        <div className="rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <p className="font-grotesk font-semibold text-2xl">
              <Price cents={selectedVariant.priceCents} />
            </p>
            <p className="font-semibold text-sm">
              {selectedVariant.availableQty > 0
                ? `${selectedVariant.availableQty} available`
                : "Out of stock"}
            </p>
          </div>
        </div>
      ) : null}
      {/* Quantity and add-to-cart share one row at every size; stacking them on
          phones pushed the button below the fold. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:gap-4">
        <QuantityControl max={maxQuantity} onChange={setQuantity} value={quantity} />
        {selectedVariant ? (
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
        ) : null}
      </div>
    </div>
  );
}
