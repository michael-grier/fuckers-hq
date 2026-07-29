import type { Metadata } from "next";

import { EmptyState } from "@/components/shop/empty-state";
import { PageHeader } from "@/components/shop/page-header";

export const metadata: Metadata = {
  title: "Videos",
  description: "Watch Fuckers HQ edits, crew parts, and session clips.",
};

export default function VideosPage() {
  return (
    <main className="min-h-screen py-10">
      <PageHeader
        description="Shop edits, crew parts, and clips from everyday sessions will live here."
        eyebrow="Fuckers HQ"
        title="Watch the latest."
      />
      <div className="mx-auto max-w-7xl px-6 pt-8">
        <EmptyState
          title="The first edit is coming soon"
          description="We are cutting together new footage. Check back for full parts, quick clips, and shop sessions."
        />
      </div>
    </main>
  );
}
