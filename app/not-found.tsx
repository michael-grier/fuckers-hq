import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";

// Next.js marks 404s noindex by default; the root layout's `robots` override would otherwise
// replace that and make every missing URL indexable once ALLOW_INDEXING is on.
export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <div className="space-y-2">
        <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">404</p>
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">
          This page is off the board.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          The page may have moved, or the product may no longer be active.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Back to shop</Link>
      </Button>
    </main>
  );
}
