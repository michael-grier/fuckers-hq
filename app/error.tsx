"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-6 px-6">
      <div className="space-y-2">
        <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          Something went wrong
        </p>
        <h1 className="font-grotesk font-semibold text-4xl tracking-tight">
          The shop hit an error.
        </h1>
        <p className="max-w-xl text-muted-foreground">
          Try again. If this keeps happening, the error will be visible in the server logs and
          Sentry once observability is configured.
        </p>
      </div>
      <Button type="button" onClick={reset}>
        <RotateCcw aria-hidden="true" />
        Retry
      </Button>
    </main>
  );
}
