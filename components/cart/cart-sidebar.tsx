"use client";

import type { Route } from "next";
import Link from "next/link";
import { type ReactNode, useRef } from "react";

import { CartLineItem } from "@/components/cart/cart-line-item";
import { CartSummary } from "@/components/cart/cart-summary";
import { CheckoutButton } from "@/components/cart/checkout-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getCartItemCount } from "@/lib/cart/selectors";
import { useCartStore } from "@/lib/cart/store";
import type { CartDisplayLine } from "@/lib/cart/types";
import { cn } from "@/lib/utils";

type CartSidebarProps = {
  children: ReactNode;
};

type CartSidebarContentProps = {
  lines: CartDisplayLine[];
  onClear: () => void;
};

export function CartSidebarContent({ lines, onClear }: CartSidebarContentProps) {
  const itemCount = getCartItemCount(lines);
  const itemLabel = itemCount === 1 ? "item" : "items";

  return (
    <>
      <SheetHeader className="shrink-0 border-b px-4 py-5 pr-14 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <SheetTitle className="font-grotesk font-semibold text-2xl">Your cart</SheetTitle>
            <SheetDescription>
              {itemCount === 0
                ? "Your cart is empty."
                : `${itemCount} ${itemLabel}. Update your cart or continue to checkout.`}
            </SheetDescription>
          </div>
          {lines.length > 0 ? (
            <Button onClick={onClear} size="sm" type="button" variant="outline">
              Clear cart
            </Button>
          ) : null}
        </div>
      </SheetHeader>

      {lines.length === 0 ? (
        <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-lg border border-dashed px-6 py-12 text-center sm:m-6">
          <div className="max-w-sm space-y-3">
            <h3 className="font-grotesk font-semibold text-2xl">Ready when you are.</h3>
            <p className="text-muted-foreground">
              Add hardgoods, softgoods, or accessories to see them here.
            </p>
            <SheetClose asChild>
              <Button className="mt-3" type="button">
                Continue shopping
              </Button>
            </SheetClose>
          </div>
        </div>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
            {lines.map((line) => (
              <CartLineItem compact key={line.variantId} line={line} />
            ))}
          </div>
          <SheetFooter className="shrink-0 gap-3 border-t bg-background px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <CartSummary />
            <CheckoutButton />
            <SheetClose asChild>
              <Link
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                href={"/cart" as Route}
              >
                View cart
              </Link>
            </SheetClose>
            <SheetClose asChild>
              <Button className="w-full" type="button" variant="ghost">
                Continue shopping
              </Button>
            </SheetClose>
          </SheetFooter>
        </>
      )}
    </>
  );
}

export function CartSidebar({ children }: CartSidebarProps) {
  const lines = useCartStore((state) => state.lines);
  const clear = useCartStore((state) => state.clear);
  const isCartOpen = useCartStore((state) => state.isCartOpen);
  const setCartOpen = useCartStore((state) => state.setCartOpen);
  const programmaticTriggerRef = useRef<HTMLElement | null>(null);

  return (
    <Sheet onOpenChange={setCartOpen} open={isCartOpen}>
      {children}
      <SheetContent
        className="h-dvh w-full gap-0 p-0 sm:max-w-lg"
        onCloseAutoFocus={(event) => {
          if (!programmaticTriggerRef.current?.isConnected) {
            return;
          }

          event.preventDefault();
          programmaticTriggerRef.current.focus();
          programmaticTriggerRef.current = null;
        }}
        onOpenAutoFocus={() => {
          const activeElement =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

          // Radix knows the header trigger; preserve the invoking control for programmatic opens.
          programmaticTriggerRef.current =
            activeElement &&
            activeElement !== document.body &&
            !activeElement.closest('[data-slot="sheet-trigger"]')
              ? activeElement
              : null;
        }}
      >
        <CartSidebarContent lines={lines} onClear={clear} />
      </SheetContent>
    </Sheet>
  );
}
