import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Shipping payment not completed",
  robots: { index: false, follow: false },
};

export default function ShippingPaymentCancelledPage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <p className="font-grotesk font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
          Shipping update
        </p>
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">
          Shipping payment wasn’t completed.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Your original order has not been changed. You can use the secure link in your email until
          it expires, or contact us to cancel the order for a refund.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <a href={`mailto:${env.SUPPORT_EMAIL}`}>Contact us</a>
        </Button>
        <Button asChild variant="outline">
          <Link href="/products">Return to the shop</Link>
        </Button>
      </div>
    </main>
  );
}
