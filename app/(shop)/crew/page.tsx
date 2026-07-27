import type { Metadata } from "next";

import { EmptyState } from "@/components/shop/empty-state";

export const metadata: Metadata = {
  title: "Crew",
  description: "Meet the riders and people behind Skate Shop.",
};

export default function CrewPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3 border-b pb-8">
        <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          Skate Shop
        </p>
        <div className="space-y-2">
          <h1 className="font-black text-5xl tracking-normal">Meet the crew.</h1>
          <p className="max-w-2xl text-muted-foreground">
            Rider profiles, shop regulars, and the people behind Skate Shop will live here.
          </p>
        </div>
      </header>
      <EmptyState
        title="Crew profiles are on the way"
        description="We are putting together rider stories, favorite setups, and the spots that keep the crew rolling."
      />
    </main>
  );
}
