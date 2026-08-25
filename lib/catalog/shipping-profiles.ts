export const shippingProfileValues = ["deck", "softgood", "flat"] as const;

export type ShippingProfile = (typeof shippingProfileValues)[number];

/** Admin labels for assigning a product's checkout shipping tier. */
export const shippingProfiles = [
  { value: "deck", label: "Deck" },
  { value: "softgood", label: "Softgood" },
  { value: "flat", label: "Flat" },
] as const satisfies ReadonlyArray<{
  value: ShippingProfile;
  label: string;
}>;

/** Narrows untrusted form values to the canonical profile enum. */
export function isShippingProfile(value: string): value is ShippingProfile {
  return shippingProfileValues.some((profile) => profile === value);
}
