"use client";

import { useSyncExternalStore } from "react";
import { create } from "zustand";
import {
  createJSONStorage,
  type PersistStorage,
  persist,
  type StorageValue,
} from "zustand/middleware";

import { persistedCartStateSchema } from "@/lib/validators/cart";
import { MAX_CART_LINE_QUANTITY } from "./constants";
import type {
  AddCartLineInput,
  CartDisplayLine,
  CartFulfillmentMethod,
  DeliveryEligibility,
} from "./types";

type CartState = {
  lines: CartDisplayLine[];
  // A preference only. The server decides whether delivery is actually offered, and
  // `resolveFulfillmentMethod` coerces this back to shipping when it is not — including a
  // persisted value from before the current method names existed.
  fulfillmentMethod: CartFulfillmentMethod;
  // Short-lived and deliberately excluded from localStorage. A new browser session must recheck
  // the address instead of reviving an expired proof.
  deliveryEligibility: DeliveryEligibility | null;
  isCartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  setFulfillmentMethod: (method: CartFulfillmentMethod) => void;
  setDeliveryEligibility: (eligibility: DeliveryEligibility) => void;
  clearDeliveryEligibility: () => void;
  addLine: (line: AddCartLineInput) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeLine: (variantId: string) => void;
  clear: () => void;
};

type PersistedCartState = Pick<CartState, "lines" | "fulfillmentMethod">;

function clampQuantity(quantity: number): number {
  return Math.min(Math.max(Math.trunc(quantity), 1), MAX_CART_LINE_QUANTITY);
}

/**
 * `createJSONStorage` lets `JSON.parse` throw, and zustand answers a throwing `getItem` by leaving
 * `hasHydrated()` false and never running its finish-hydration listeners. Anything gated on
 * hydration would then wait forever, so a corrupt payload would strand `/cart` on its skeleton.
 * A cart we cannot parse is not worth recovering: drop it so hydration settles on an empty cart,
 * which is what a shopper saw for corrupt data before hydration was gated at all.
 *
 * Parseable-but-misshapen payloads get the same treatment. Zustand's default `merge` shallow-merges
 * whatever was stored straight into the store, and a non-array `lines` would then crash
 * `getCartItemCount` in the shop layout on every page. Persisted state that fails
 * `persistedCartStateSchema` — however it got that way — is discarded whole rather than repaired,
 * so hydration always settles on either a well-formed cart or an empty one.
 *
 * ── Changing the persisted cart shape? Read this first. ──────────────────────────────────────
 * Additive optional fields need no ceremony: add them to the schema as `.optional()`/`.nullish()`
 * and carts persisted before the change keep validating. Any breaking change — rename, type
 * change, removed field, restructure — must be versioned HERE, not via zustand's `migrate`:
 * this `getItem` runs before zustand's version check, so an updated schema would reject and
 * delete every old-version cart before `migrate` ever saw it. Instead:
 *
 *   1. Keep the outgoing schema around as `persistedCartStateV<n>Schema`.
 *   2. Branch on `stored.version` in `getItem`: validate old payloads against their own version's
 *      schema, convert them with a plain function, and return the converted state stamped with
 *      the new version. Unknown versions fall through to the existing drop path, which is the
 *      correct behavior for rollbacks and garbage.
 *   3. Add `version: <n + 1>` to the persist options so new writes are stamped.
 *
 * The shape canary in tests/cart.test.ts fails on any change to the persisted contract so this
 * comment gets read before a shape change ships.
 */
function createCartStorage(): PersistStorage<PersistedCartState> | undefined {
  // `unknown` state on the inner storage forces the schema check before anything is typed as a cart.
  const storage = createJSONStorage<unknown>(() => localStorage);

  if (!storage) {
    return undefined;
  }

  return {
    setItem: (name, value) => storage.setItem(name, value),
    removeItem: (name) => storage.removeItem(name),
    getItem: (name): StorageValue<PersistedCartState> | null => {
      let stored: Awaited<ReturnType<typeof storage.getItem>>;

      try {
        // localStorage is synchronous, so a parse failure surfaces as a throw rather than a
        // rejection, and the promise arm of the storage type never occurs.
        stored = storage.getItem(name) as typeof stored;
      } catch {
        storage.removeItem(name);
        return null;
      }

      if (stored === null) {
        return null;
      }

      const state = persistedCartStateSchema.safeParse(stored.state);

      if (!state.success) {
        storage.removeItem(name);
        return null;
      }

      return { ...stored, state: state.data };
    },
  };
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      fulfillmentMethod: "shipping",
      deliveryEligibility: null,
      isCartOpen: false,
      setCartOpen: (open) => set({ isCartOpen: open }),
      setFulfillmentMethod: (method) => set({ fulfillmentMethod: method }),
      setDeliveryEligibility: (eligibility) =>
        set({ deliveryEligibility: eligibility, fulfillmentMethod: "delivery" }),
      clearDeliveryEligibility: () =>
        set({ deliveryEligibility: null, fulfillmentMethod: "shipping" }),
      addLine: (line) => {
        const quantity = clampQuantity(line.quantity ?? 1);

        set((state) => {
          const existingLine = state.lines.find((item) => item.variantId === line.variantId);

          if (existingLine) {
            return {
              deliveryEligibility: null,
              fulfillmentMethod: "shipping",
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
            deliveryEligibility: null,
            fulfillmentMethod: "shipping",
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
          deliveryEligibility: null,
          fulfillmentMethod: "shipping",
          lines: state.lines.map((line) =>
            line.variantId === variantId ? { ...line, quantity: clampQuantity(quantity) } : line,
          ),
        }));
      },
      removeLine: (variantId) => {
        set((state) => ({
          deliveryEligibility: null,
          fulfillmentMethod: "shipping",
          lines: state.lines.filter((line) => line.variantId !== variantId),
        }));
      },
      clear: () => set({ lines: [], deliveryEligibility: null, fulfillmentMethod: "shipping" }),
    }),
    {
      name: "fuckers-hq-cart",
      storage: createCartStorage(),
      partialize: (state): PersistedCartState => ({
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
