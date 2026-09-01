import { z } from "zod";

export const canadianProvinceCodes = [
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
] as const;

export const destinationProvinceSchema = z.enum(canadianProvinceCodes);

export type DestinationProvince = z.infer<typeof destinationProvinceSchema>;

type StripeAddressRegion = {
  country?: string | null;
  state?: string | null;
};

/** Returns the normalized Canadian province or territory from a Stripe address. */
export function getDestinationProvince(
  address: StripeAddressRegion | null | undefined,
): DestinationProvince | null {
  if (address?.country?.trim().toUpperCase() !== "CA") {
    return null;
  }

  const province = destinationProvinceSchema.safeParse(address.state?.trim().toUpperCase());
  return province.success ? province.data : null;
}
