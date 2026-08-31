import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getStripe } from "@/lib/stripe";
import { parseShippingPaymentReference } from "@/lib/webhooks/stripe";

export const metadata: Metadata = {
  title: "Shipping payment received",
  robots: { index: false, follow: false },
};

type ShippingPaymentSuccessPageProps = {
  searchParams: Promise<{ session_id?: string | string[] }>;
};

function getSessionId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^cs_(?:live|test)_[A-Za-z0-9]+$/.test(value) ? value : null;
}

async function isPaidShippingSession(sessionId: string | null): Promise<boolean> {
  if (!sessionId) {
    return false;
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    return (
      parseShippingPaymentReference(session) !== null &&
      (session.payment_status === "paid" || session.payment_status === "no_payment_required")
    );
  } catch {
    return false;
  }
}

export default async function ShippingPaymentSuccessPage({
  searchParams,
}: ShippingPaymentSuccessPageProps) {
  const { session_id: sessionIdParam } = await searchParams;
  const paymentReceived = await isPaidShippingSession(getSessionId(sessionIdParam));

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-3xl flex-col items-start justify-center gap-6 px-6 py-16">
      <div className="space-y-2">
        <p className="font-grotesk font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
          Shipping update
        </p>
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">
          {paymentReceived ? "Shipping payment received." : "We couldn’t verify that payment."}
        </h1>
        <p className="max-w-xl text-muted-foreground">
          {paymentReceived
            ? "Your order will now move into our regular shipping queue. We’ll email you when it ships."
            : "If Stripe showed a successful payment, you do not need to pay again. Contact us and we’ll check the order."}
        </p>
      </div>
      <Button asChild>
        <Link href="/products">Continue shopping</Link>
      </Button>
    </main>
  );
}
