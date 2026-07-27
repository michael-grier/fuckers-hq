"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { MAX_CART_LINE_QUANTITY } from "./constants";
import type { AddCartLineInput, CartDisplayLine } from "./types";

type CartState = {
  lines: CartDisplayLine[];
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
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
      isCartOpen: false,
      setCartOpen: (open) => set({ isCartOpen: open }),
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
      name: "skate-shop-cart",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ lines: state.lines }),
    },
  ),
);
