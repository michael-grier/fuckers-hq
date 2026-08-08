import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import {
  getCheckoutCartFingerprint,
  resolveFulfillmentMethod,
  toCheckoutRequest,
} from "@/lib/cart/selectors";
import type { CartDisplayLine } from "@/lib/cart/types";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

const { useCartStore } = await import("@/lib/cart/store");

afterAll(() => {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    return;
  }

  Reflect.deleteProperty(globalThis, "localStorage");
});

const deck: CartDisplayLine = {
  variantId: "3f5277e9-b73f-4a94-9bc8-5f9d06f9f5d6",
  quantity: 1,
  productName: "Database Deck",
  variantName: '8.25"',
  priceCents: 8900,
  imageUrl: "https://images.example.com/deck.jpg",
};

const bearings: CartDisplayLine = {
  variantId: "879dd483-16c9-4d6c-885f-b00525f84923",
  quantity: 1,
  productName: "Precision Bearings",
  variantName: "Set of 8",
  priceCents: 3400,
  imageUrl: null,
};

beforeEach(() => {
  useCartStore.setState({ isCartOpen: false, lines: [] });
  storage.clear();
});

describe("cart store", () => {
  test("adds lines and merges repeated variants within the quantity cap", () => {
    useCartStore.getState().addLine(deck);
    useCartStore.getState().addLine({ ...deck, quantity: 2, productName: "Updated Deck" });
    useCartStore.getState().addLine({ ...deck, quantity: 98, productName: "Updated Deck" });

    expect(useCartStore.getState().lines).toEqual([
      {
        ...deck,
        productName: "Updated Deck",
        quantity: 99,
      },
    ]);
    expect(useCartStore.getState().isCartOpen).toBe(true);
  });

  test("controls the sidebar without persisting its open state", () => {
    useCartStore.getState().addLine(deck);
    useCartStore.getState().setCartOpen(false);

    expect(useCartStore.getState().isCartOpen).toBe(false);
    expect(storage.getItem("fuckers-hq-cart")).not.toContain("isCartOpen");
  });

  test("updates quantities, removes lines, and clears the cart", () => {
    useCartStore.getState().addLine(deck);
    useCartStore.getState().addLine(bearings);
    useCartStore.getState().updateQuantity(deck.variantId, 3);
    useCartStore.getState().removeLine(bearings.variantId);

    expect(useCartStore.getState().lines).toEqual([{ ...deck, quantity: 3 }]);

    useCartStore.getState().clear();
    expect(useCartStore.getState().lines).toEqual([]);
  });

  test("rehydrates persisted cart state after a simulated refresh", async () => {
    useCartStore.getState().addLine(deck);
    useCartStore.getState().addLine(bearings);

    const persistedCart = storage.getItem("fuckers-hq-cart");
    expect(persistedCart).not.toBeNull();

    useCartStore.setState({ isCartOpen: false, lines: [] });
    storage.setItem("fuckers-hq-cart", persistedCart ?? "");
    await useCartStore.persist.rehydrate();

    expect(useCartStore.getState().lines).toEqual([deck, bearings]);
    expect(useCartStore.getState().isCartOpen).toBe(false);
  });

  // A corrupt payload makes zustand's `getItem` throw, which leaves hydration permanently unfinished
  // and would strand the cart page on the loading skeleton it now shows until hydration settles.
  test("settles hydration and discards a corrupt persisted cart", async () => {
    storage.setItem("fuckers-hq-cart", '{"state":{"lines":[');

    let finishedHydration = false;
    const unsubscribe = useCartStore.persist.onFinishHydration(() => {
      finishedHydration = true;
    });

    await useCartStore.persist.rehydrate();
    unsubscribe();

    // The page subscribes to this listener, so it has to fire even on unreadable data.
    expect(finishedHydration).toBe(true);
    expect(useCartStore.persist.hasHydrated()).toBe(true);
    expect(useCartStore.getState().lines).toEqual([]);
    expect(storage.getItem("fuckers-hq-cart")).toBeNull();
  });

  test("builds checkout intent without display snapshot fields", () => {
    useCartStore.getState().addLine({ ...deck, quantity: 2 });

    expect(toCheckoutRequest(useCartStore.getState().lines, "request-123", "pickup")).toEqual({
      requestId: "request-123",
      items: [{ variantId: deck.variantId, quantity: 2 }],
      fulfillmentMethod: "pickup",
    });
  });

  test("uses one checkout request identity for equivalent reordered carts", () => {
    expect(getCheckoutCartFingerprint([deck, bearings], "shipping")).toBe(
      getCheckoutCartFingerprint([bearings, deck], "shipping"),
    );
    expect(getCheckoutCartFingerprint([deck, bearings], "shipping")).not.toBe(
      getCheckoutCartFingerprint([{ ...deck, quantity: 2 }, bearings], "shipping"),
    );
  });

  test("gives a new request identity when the fulfillment method changes", () => {
    // A reserved checkout refuses replay under a different method, so the IDs must differ.
    expect(getCheckoutCartFingerprint([deck], "shipping")).not.toBe(
      getCheckoutCartFingerprint([deck], "pickup"),
    );
  });

  test("honours a stored pickup preference only while pickup is offered", () => {
    expect(resolveFulfillmentMethod("pickup", true)).toBe("pickup");
    expect(resolveFulfillmentMethod("pickup", false)).toBe("shipping");
    expect(resolveFulfillmentMethod("shipping", true)).toBe("shipping");
  });
});
