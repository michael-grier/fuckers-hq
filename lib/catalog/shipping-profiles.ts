export const shippingProfileValues = ["deck", "softgood", "flat"] as const;

export type ShippingProfile = (typeof shippingProfileValues)[number];

/** Admin copy for assigning products and maintaining their checkout shipping tier. */
export const shippingProfiles = [
  { value: "deck", label: "Deck", description: "Rigid deck mailer." },
  {
    value: "softgood",
    label: "Softgood",
    description: "Parcel for apparel and compact parts.",
  },
  { value: "flat", label: "Flat", description: "Letter mail for stickers." },
] as const satisfies ReadonlyArray<{
  value: ShippingProfile;
  label: string;
  description: string;
}>;

/** Narrows untrusted form values to the canonical profile enum. */
export function isShippingProfile(value: string): value is ShippingProfile {
  return shippingProfileValues.some((profile) => profile === value);
}
