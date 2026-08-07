"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { MAX_CART_LINE_QUANTITY } from "./constants";
import type { AddCartLineInput, CartDisplayLine, CartFulfillmentMethod } from "./types";

type CartState = {
  lines: CartDisplayLine[];
  // A preference only. The server decides whether pickup is actually offered, and
  // `resolveFulfillmentMethod` coerces this back to shipping when it is not.
  fulfillmentMethod: CartFulfillmentMethod;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setFulfillmentMethod: (method: CartFulfillmentMethod) => void;
  addLine: (line: AddCartLineInput) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
};

function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_CART_LINE_QUANTITY);
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      fulfillmentMethod: "shipping",
      isCartOpen: false,
      setCartOpen: (open) => set({ isCartOpen: open }),
      setFulfillmentMethod: (method) => set({ fulfillmentMethod: method }),
      addLine: (line) => {
        const quantity = clampQuantity(line.quantity ?? 1);

        set((state) => {
          const existingLine = state.lines.find((item) => item.variantId === line.variantId);

          if (existingLine) {
            return {
              isCartOpen: true,
              lines: state.lines.map((item) =>
                item.variantId === line.variantId
                  ? {
                      ...item,
                      quantity: clampQuantity(item.quantity + quantity),
                      productName: line.productName,
                      variantName: line.variantName,
                      priceCents: line.priceCents,
                      imageUrl: line.imageUrl,
                    }
                  : item,
              ),
            };
          }

          return {
            isCartOpen: true,
            lines: [
              ...state.lines,
              {
                ...line,
                quantity,
              },
            ],
          };
        });
      },
      updateQuantity: (variantId, quantity) => {
        set((state) => ({
          lines: state.lines.map((line) =>
            line.variantId === variantId ? { ...line, quantity: clampQuantity(quantity) } : line,
          ),
        }));
      },
      removeLine: (variantId) => {
        set((state) => ({
          lines: state.lines.filter((line) => line.variantId !== variantId),
        }));
      },
      clear: () => set({ lines: [] }),
    }),
    {
      name: "fuckers-hq-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        lines: state.lines,
        fulfillmentMethod: state.fulfillmentMethod,
      }),
    },
  ),
);

function subscribeToCartHydration(onStoreChange: () => void): () => void {
  return useCartStore.persist.onFinishHydration(onStoreChange);
}

function getCartHydrationSnapshot(): boolean {
  return useCartStore.persist.hasHydrated();
}

function getCartHydrationServerSnapshot(): boolean {
  return false;
}

/**
 * The cart only exists in localStorage, so the server and the hydrating client render both see an
 * empty cart before the persisted state is read back. Gate any "the cart is empty" UI on this so a
 * full document load — such as returning from Stripe's hosted checkout — cannot paint a false empty
 * state. Reading through `useSyncExternalStore` keeps the server snapshot pinned to `false` while
 * still reporting `true` on the first render of a client navigation, which has nothing to rehydrate.
 */
export function useCartHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToCartHydration,
    getCartHydrationSnapshot,
    getCartHydrationServerSnapshot,
  );
}
