import type { Metadata } from "next";

import { EmptyState } from "@/components/shop/empty-state";

export const metadata: Metadata = {
  title: "Videos",
  description: "Watch Fuckers HQ edits, crew parts, and session clips.",
};

export default function VideosPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3 border-b pb-8">
        <p className="font-semibold text-muted-foreground text-sm uppercase tracking-wide">
          Fuckers HQ
        </p>
        <div className="space-y-2">
          <h1 className="font-black text-5xl tracking-normal">Watch the latest.</h1>
          <p className="max-w-2xl text-muted-foreground">
            Shop edits, crew parts, and clips from everyday sessions will live here.
          </p>
        </div>
      </header>
      <EmptyState
        title="The first edit is coming soon"
        description="We are cutting together new footage. Check back for full parts, quick clips, and shop sessions."
      />
    </main>
  );
}
