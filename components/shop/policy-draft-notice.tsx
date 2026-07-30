import { TriangleAlert } from "lucide-react";

// These policies are unreviewed drafts. They state the brand's real obligations to
// customers, so they must not ship to production as-is.
//
// To publish: replace every [BRACKETED] placeholder with the brand's confirmed values,
// have the brand (ideally with legal advice) approve the wording, then delete this file.
// The compiler will then point at every page that still renders the notice.
export function PolicyDraftNotice() {
  return (
    <div
      className="flex gap-3 rounded-lg border border-dashed bg-muted/40 px-4 py-3"
      role="note"
      aria-label="Draft policy notice"
    >
      <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent" />
      <p className="text-muted-foreground text-sm leading-relaxed">
        <span className="font-semibold text-foreground">Draft pending review.</span> This policy is
        a working draft and is not yet binding. Bracketed values still need to be confirmed by the
        brand before launch.
      </p>
    </div>
  );
}
