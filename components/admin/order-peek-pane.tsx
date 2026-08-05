"use client";

import { parseAsString, useQueryStates } from "nuqs";
import { useCallback, useSyncExternalStore } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { adminFilterUrlOptions } from "@/lib/admin/search-params";

const desktopSplitQuery = "(min-width: 1024px)";

type OrderPeekPaneProps = {
  /** Title for the sheet dialog, e.g. the order number. */
  title: string;
  children: React.ReactNode;
};

/**
 * Presents the order preview in the layout that fits the viewport: a
 * viewport-height column beside the list from lg up, and a bottom sheet below it.
 *
 * The sheet is only mounted once the client has confirmed a small viewport, so
 * the dialog never traps focus or locks scrolling while the desktop pane is the
 * visible surface.
 */
export function OrderPeekPane({ title, children }: OrderPeekPaneProps) {
  const isDesktopSplit = useMediaQuery(desktopSplitQuery);
  const [, setParams] = useQueryStates({ peek: parseAsString }, adminFilterUrlOptions);

  function closePeek() {
    void setParams({ peek: null });
  }

  return (
    <>
      <aside
        aria-label={`Preview of order ${title}`}
        className="hidden rounded-lg border bg-background lg:block lg:overflow-y-auto"
      >
        {children}
      </aside>

      {/* Strict false, not falsy: while the viewport is still unknown (server
          render and hydration) the sheet must stay unmounted, or Radix would
          briefly lock scrolling and pull focus on desktop before the media
          query resolves. */}
      {isDesktopSplit === false ? (
        <Sheet
          onOpenChange={(open) => {
            if (!open) {
              closePeek();
            }
          }}
          open
        >
          <SheetContent
            className="max-h-[85vh] gap-0 overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            side="bottom"
          >
            <SheetHeader className="pb-2">
              <SheetTitle className="font-grotesk text-lg">{title}</SheetTitle>
            </SheetHeader>
            {children}
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  );
}

/**
 * Returns null until the client can measure the viewport, then the live match.
 *
 * React uses the server snapshot for both SSR and the hydration render, so a
 * boolean default would make hydration claim a definite viewport it cannot know.
 * Callers must therefore branch on `=== false` rather than falsiness.
 */
function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore<boolean | null>(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}
