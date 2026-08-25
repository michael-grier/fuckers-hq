import { ShippingRateEditor } from "@/components/admin/shipping-rate-editor";
import { getAdminShippingRates } from "@/lib/admin/queries";

export default async function AdminShippingRatesPage() {
  const rates = await getAdminShippingRates();

  return <ShippingRateEditor rates={rates} />;
}
