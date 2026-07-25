export type CartDisplayLine = {
  variantId: string;
  quantity: number;
  productName: string;
  variantName: string;
  priceCents: number;
  imageUrl?: string | null;
};

export type CheckoutRequest = {
  requestId: string;
  items: Array<{
    variantId: string;
    quantity: number;
  }>;
};

export type AddCartLineInput = Omit<CartDisplayLine, "quantity"> & {
  quantity?: number;
};
