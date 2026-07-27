"use client";

import { Trash2 } from "lucide-react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { useCartStore } from "@/lib/cart/store";
import type { CartDisplayLine } from "@/lib/cart/types";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

import { QuantityControl } from "../shop/quantity-control";

type CartLineItemProps = {
  line: CartDisplayLine;
  compact?: boolean;
};

export function CartLineItem({ line, compact = false }: CartLineItemProps) {
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeLine = useCartStore((state) => state.removeLine);
  const quantityLabel = `${line.productName}, ${line.variantName}`;

  return (
    <article
      className={cn(
        "grid gap-4 border-b py-5",
        compact ? "grid-cols-[5rem_minmax(0,1fr)]" : "sm:grid-cols-[6rem_1fr_auto]",
      )}
    >
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-md bg-muted",
          compact && "size-20",
        )}
      >
        {line.imageUrl ? (
          <Image
            alt=""
            className="h-full w-full object-contain object-center"
            fill
            sizes={compact ? "5rem" : "6rem"}
            src={line.imageUrl}
            unoptimized
          />
        ) : null}
      </div>
      <div className="min-w-0 space-y-2">
        <div className={cn("min-w-0", compact && "flex items-start justify-between gap-3")}>
          <div className="min-w-0">
            {compact ? (
              <h3 className="truncate font-black text-lg">{line.productName}</h3>
            ) : (
              <h2 className="truncate font-black text-xl">{line.productName}</h2>
            )}
            <p className="text-muted-foreground text-sm">{line.variantName}</p>
          </div>
          {compact ? (
            <p className="shrink-0 font-black">{formatMoney(line.priceCents * line.quantity)}</p>
          ) : null}
        </div>
        <p className="font-bold text-sm">{formatMoney(line.priceCents)} each</p>
        <div className={cn(compact && "flex items-center justify-between gap-3")}>
          <QuantityControl
            label={quantityLabel}
            onChange={(quantity) => updateQuantity(line.variantId, quantity)}
            value={line.quantity}
          />
          {compact ? (
            <Button
              onClick={() => removeLine(line.variantId)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Trash2 aria-hidden="true" />
              <span className="sr-only">Remove {quantityLabel}</span>
            </Button>
          ) : null}
        </div>
      </div>
      {compact ? null : (
        <div className="flex items-start justify-between gap-4 sm:flex-col sm:items-end">
          <p className="font-black text-xl">{formatMoney(line.priceCents * line.quantity)}</p>
          <Button
            onClick={() => removeLine(line.variantId)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
            <span className="sr-only">Remove {quantityLabel}</span>
          </Button>
        </div>
      )}
    </article>
  );
}
