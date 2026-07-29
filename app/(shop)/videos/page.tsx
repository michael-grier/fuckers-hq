import type { Metadata } from "next";

import { EmptyState } from "@/components/shop/empty-state";
import { PageHeader } from "@/components/shop/page-header";

export const metadata: Metadata = {
  title: "Videos",
  description: "Watch Fuckers Skateboards full length videos, crew parts, and edits.",
};

export default function VideosPage() {
  return (
    <main className="min-h-screen py-10">
      <PageHeader
        description="Watch us getting down in the streets."
        title="Watch the latest."
      />
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <EmptyState
          title="Videos are coming soon"
          description="We're working on it okay?"
        />
      </div>
    </main>
  );
}
