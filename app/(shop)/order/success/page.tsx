import Link from "next/link";

import { ClearCartOnSuccess } from "@/components/cart/clear-cart-on-success";
import { Button } from "@/components/ui/button";
import { isCompletedPaidCheckout } from "@/lib/checkout/completion";
import { getStripe } from "@/lib/stripe";

type OrderSuccessPageProps = {
  searchParams: Promise<{
    session_id?: string | string[];
  }>;
};

function getSessionId(value: string | string[] | undefined): string | null {
  return typeof value === "string" && /^cs_(?:live|test)_[A-Za-z0-9]+$/.test(value) ? value : null;
}

async function isVerifiedPaidSession(sessionId: string | null): Promise<boolean> {
  if (!sessionId) {
    return false;
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);

    return isCompletedPaidCheckout(session);
  } catch {
    return false;
  }
}

export default async function OrderSuccessPage({ searchParams }: OrderSuccessPageProps) {
  const { session_id: sessionIdParam } = await searchParams;
  const shouldClearCart = await isVerifiedPaidSession(getSessionId(sessionIdParam));

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      {shouldClearCart ? <ClearCartOnSuccess /> : null}
      <div className="space-y-2">
        <p className="flex items-center gap-2 font-grotesk font-semibold text-muted-foreground text-xs uppercase tracking-[0.14em]">
          <span aria-hidden="true" className="h-0.5 w-6 bg-accent" />
          Order received
        </p>
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">
          Thanks for your order.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Your payment was received. We’ll send an order summary and shipping details to the email
          address provided at checkout.
        </p>
      </div>
      <Button asChild>
        <Link href="/products">Continue shopping</Link>
      </Button>
    </main>
  );
}
