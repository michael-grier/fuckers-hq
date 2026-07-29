import type { Metadata } from "next";

import { EmptyState } from "@/components/shop/empty-state";
import { PageHeader } from "@/components/shop/page-header";

export const metadata: Metadata = {
  title: "Crew",
  description: "Meet the riders and people behind Fuckers HQ.",
};

export default function CrewPage() {
  return (
    <main className="min-h-screen py-10">
      <PageHeader
        description="Rider profiles, shop regulars, and the people behind Fuckers HQ will live here."
        eyebrow="Fuckers HQ"
        title="Meet the crew."
      />
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <EmptyState
          title="Crew profiles are on the way"
          description="We are putting together rider stories, favorite setups, and the spots that keep the crew rolling."
        />
      </div>
    </main>
  );
}
