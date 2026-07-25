"use client";

import { Check, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart/store";
import type { AddCartLineInput } from "@/lib/cart/types";

type AddToCartButtonProps = {
  line: AddCartLineInput;
  disabled?: boolean;
};

export function AddToCartButton({ line, disabled }: AddToCartButtonProps) {
  const addLine = useCartStore((state) => state.addLine);
  const [addedLineKey, setAddedLineKey] = useState<string | null>(null);
  const lineKey = `${line.variantId}:${line.quantity ?? 1}`;
  const wasAdded = addedLineKey === lineKey;

  function handleAddToCart() {
    addLine(line);
    setAddedLineKey(lineKey);
  }

  return (
    <Button
      className="w-full cursor-pointer"
      disabled={disabled}
      onClick={handleAddToCart}
      size="lg"
      type="button"
    >
      {wasAdded ? <Check aria-hidden="true" /> : <ShoppingCart aria-hidden="true" />}
      <span aria-live="polite">{wasAdded ? "Added to cart" : "Add to cart"}</span>
    </Button>
  );
}
