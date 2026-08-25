import "server-only";

import type { ShippingProfile } from "@/lib/catalog/shipping-profiles";
import type { Database } from "@/lib/db/client";
import { shippingRates } from "@/lib/db/schema";

type ShippingRateWrite = {
  profile: ShippingProfile;
  rateCents: number;
};

/** Replaces the full rate configuration atomically, recreating a missing profile row if needed. */
export async function saveShippingRateConfig(
  database: Database,
  rates: ReadonlyArray<ShippingRateWrite>,
): Promise<void> {
  await database.transaction(async (tx) => {
    const updatedAt = new Date();

    // Sequential statements use the canonical profile order, avoiding inconsistent lock order
    // when two administrators save at the same time.
    for (const rate of rates) {
      await tx
        .insert(shippingRates)
        .values({ ...rate, updatedAt })
        .onConflictDoUpdate({
          target: shippingRates.profile,
          set: { rateCents: rate.rateCents, updatedAt },
        });
    }
  });
}
