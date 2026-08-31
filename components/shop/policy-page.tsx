import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shop/page-header";

type PolicyPageProps = {
  title: string;
  description: string;
  // The contact page is not a policy and has no effective date.
  effectiveDate?: string;
  children: ReactNode;
};

// Shared shell for the policy and contact pages: narrower measure than the catalog
// pages because these are long-form reading rather than image grids.
export function PolicyPage({ title, description, effectiveDate, children }: PolicyPageProps) {
  return (
    <main className="min-h-screen py-10">
      <PageHeader description={description} title={title} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        {effectiveDate ? (
          <p className="text-muted-foreground text-sm">Effective date: {effectiveDate}</p>
        ) : null}
        <div className={effectiveDate ? "mt-10 space-y-10" : "space-y-10"}>{children}</div>
      </div>
    </main>
  );
}

type PolicySectionProps = {
  heading: string;
  children: ReactNode;
};

export function PolicySection({ heading, children }: PolicySectionProps) {
  return (
    <section className="space-y-3">
      <h2 className="font-grotesk font-semibold text-2xl tracking-tight">{heading}</h2>
      {children}
    </section>
  );
}

export function PolicyParagraph({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground leading-relaxed">{children}</p>;
}

export function PolicyList({ children }: { children: ReactNode }) {
  return (
    <ul className="list-disc space-y-2 pl-5 text-muted-foreground leading-relaxed">{children}</ul>
  );
}

/** Groups policy answers into one bordered question list. */
export function PolicyQuestions({ children }: { children: ReactNode }) {
  return <div className="divide-y border-y">{children}</div>;
}

/** Uses native details so every answer works with a keyboard without client-side JavaScript. */
export function PolicyQuestion({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="group py-6" open>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-sm font-grotesk font-semibold text-xl outline-none [&::-webkit-details-marker]:hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-4 sm:text-2xl">
        <span>{question}</span>
        <Plus
          aria-hidden="true"
          className="size-5 shrink-0 text-accent transition-transform group-open:rotate-45"
        />
      </summary>
      <div className="mt-3 max-w-2xl space-y-3">{children}</div>
    </details>
  );
}
