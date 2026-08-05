"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { cn } from "@/lib/utils";

export type AdminFilterOption = {
  value: string;
  label: string;
  count?: number;
  /** Renders the pill in the destructive palette when it has items needing attention. */
  urgent?: boolean;
};

type AdminFilterPillsProps = {
  /** Search-param key the pills write to. */
  name: string;
  /** Value treated as the default; selecting it removes the param from the URL. */
  defaultValue: string;
  options: readonly AdminFilterOption[];
  label: string;
};

/**
 * Filter pills rendered as links so filtering works without JavaScript and each
 * filtered view is a shareable URL. Sibling params (search text, selection) are
 * preserved, except pagination-style params that must reset on a filter change.
 */
export function AdminFilterPills({ name, defaultValue, options, label }: AdminFilterPillsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(name) ?? defaultValue;

  function hrefFor(value: string): string {
    const params = new URLSearchParams(searchParams);

    if (value === defaultValue) {
      params.delete(name);
    } else {
      params.set(name, value);
    }

    // Changing the filter can drop the selected row from the list.
    params.delete("peek");

    const query = params.toString();
    return query ? `${pathname}?${query}` : pathname;
  }

  return (
    // A nav landmark rather than a group: these are links to filtered views.
    <nav aria-label={label} className="flex flex-wrap items-center gap-2">
      {options.map((option) => {
        const isActive = option.value === active;

        return (
          <Link
            aria-current={isActive ? "true" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-semibold text-sm outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/50",
              isActive
                ? "border-primary bg-primary text-primary-foreground"
                : "border-input bg-background text-muted-foreground hover:text-foreground",
              !isActive && option.urgent && "border-destructive/40 text-destructive",
            )}
            href={hrefFor(option.value) as Route}
            key={option.value}
            prefetch={false}
            scroll={false}
          >
            {option.label}
            {option.count === undefined ? null : (
              <span className={cn("font-bold", isActive ? "text-accent" : "text-foreground/70")}>
                {option.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
