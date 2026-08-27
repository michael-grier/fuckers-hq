/**
 * A cart line as rendered and as persisted to localStorage. This shape is a persisted contract:
 * before renaming, retyping, or removing a field, follow the versioning playbook on
 * `createCartStorage` in `lib/cart/store.ts`, or carts already in shoppers' browsers get dropped.
 */
export type CartDisplayLine = {
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  priceCents: number;
  imageUrl?: string | null;
};

export type CartFulfillmentMethod = "shipping" | "delivery";

export type DeliveryEligibility = {
  token: string;
  address: {
    line1: string;
    postalCode: string;
  };
  reviewRequired: boolean;
};

export type CheckoutRequest = {
  requestId: string;
  items: Array<{
    variantId: string;
    quantity: number;
  }>;
  fulfillmentMethod: CartFulfillmentMethod;
  deliveryEligibilityToken?: string;
};

export type AddCartLineInput = Omit<CartDisplayLine, "quantity"> & {
  quantity?: number;
};
