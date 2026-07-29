import type { Metadata } from "next";

import { EmptyState } from "@/components/shop/empty-state";
import { PageHeader } from "@/components/shop/page-header";

export const metadata: Metadata = {
  title: "Crew",
  description: "Meet the riders and people behind Fuckers Skateboards.",
};

export default function CrewPage() {
  return (
    <main className="min-h-screen py-10">
      <PageHeader
        description="These are the people working to support the Calgary skate community."
        title="Meet the crew."
      />
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <EmptyState
          title="Crew profiles are on the way"
          description="Just give us a little more time alright?"
        />
      </div>
    </main>
  );
}
