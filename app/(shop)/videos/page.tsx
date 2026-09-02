import type { Metadata } from "next";

import { PageHeader } from "@/components/shop/page-header";

export const metadata: Metadata = {
  title: "Videos",
  description: "Watch Fuckers Skateboards full length videos, crew parts, and edits.",
};

export default function VideosPage() {
  return (
    <main className="min-h-screen py-10">
      <PageHeader description="Watch us getting down in the streets." title="Videos" />
      <article className="mx-auto max-w-7xl px-6 pt-10">
        <h2 className="font-grotesk font-semibold text-3xl tracking-tight md:text-4xl">
          The Fuckers Video
        </h2>
        <iframe
          allow="autoplay; picture-in-picture; clipboard-write; encrypted-media"
          allowFullScreen
          className="mt-6 aspect-video w-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          src="https://player.vimeo.com/video/831883647?h=5ca502be5f"
          title="The Fuckers Video"
        />
        <section className="mt-8 pt-8">
          <p className="font-semibold text-lg">Our first official full length video!</p>
          <div className="mt-8 grid gap-8 md:grid-cols-[2fr_1fr]">
            <div>
              <h3 className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Featuring
              </h3>
              <p className="mt-3 max-w-4xl leading-7 text-foreground/75">
                Reid Morris, Chase Worrell, Ryder Worrell, Tristan Hawkins, Eve Seward, Cort Dawne,
                Arbaz Khawja, Nic Nahbexie, Russ God, Dave Genert, Matt Roulston and Doug White
              </p>
            </div>
            <dl className="space-y-5 border-border md:border-l md:pl-8">
              <div>
                <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  Filmed by
                </dt>
                <dd className="mt-2">Doug White</dd>
              </div>
              <div>
                <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
                  Edited by
                </dt>
                <dd className="mt-2">Tristan Hawkins and Doug White</dd>
              </div>
            </dl>
          </div>
        </section>
      </article>
    </main>
  );
}
