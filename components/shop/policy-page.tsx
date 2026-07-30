import type { ReactNode } from "react";

import { PageHeader } from "@/components/shop/page-header";

type PolicyPageProps = {
  title: string;
  description: string;
  // Omitted by the contact page, which has no effective date. On the policy pages this
  // stays a placeholder until the brand approves final wording; see PolicyDraftNotice.
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
