"use client";

import { Search } from "lucide-react";
import { debounce, parseAsString, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import { adminFilterUrlOptions } from "@/lib/admin/search-params";

type AdminSearchFieldProps = {
  id: string;
  label: string;
  placeholder: string;
};

export function AdminSearchField({ id, label, placeholder }: AdminSearchFieldProps) {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    // `peek` is declared so a new search can clear a stale row selection.
    { q: parseAsString.withDefault(""), peek: parseAsString },
    {
      ...adminFilterUrlOptions,
      startTransition,
      // The shared options set shallow:false, so each URL update re-runs the
      // page's unbounded list query on the server. Debounce typing so a burst
      // of keystrokes costs one query instead of one per character; the input
      // itself stays responsive because nuqs updates local state immediately.
      limitUrlUpdates: debounce(300),
    },
  );

  return (
    <div className="relative w-full sm:max-w-xs">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        className="pl-9"
        id={id}
        onChange={async (event) => {
          // Clears any selected row, which the new results may not contain.
          await setFilters({ q: event.target.value, peek: null });
        }}
        placeholder={placeholder}
        type="search"
        value={filters.q}
      />
      <span aria-live="polite" className="sr-only">
        {isPending ? "Updating results" : ""}
      </span>
    </div>
  );
}
