import { ShippingRateEditor } from "@/components/admin/shipping-rate-editor";
import { getAdminShippingRates } from "@/lib/admin/queries";

/** Loads the current configuration for the protected shipping-rate editor. */
export default async function AdminShippingRatesPage() {
  const rates = await getAdminShippingRates();

  return <ShippingRateEditor rates={rates} />;
}
