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
 * Presents the order preview in the layout that fits the viewport: a sticky
 * column beside the list from lg up, and a bottom sheet below it.
 *
 * The sheet is only mounted on small viewports, so the dialog never traps focus
 * or locks scrolling while the desktop pane is the visible surface.
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

      {isDesktopSplit ? null : (
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
      )}
    </>
  );
}

/**
 * Reads the match during the first client render (not in an effect), so the
 * sheet never mounts for a frame on desktop before being corrected away.
 */
function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onStoreChange);
      return () => mediaQueryList.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    // The server cannot know the viewport; the desktop pane is CSS-hidden below lg.
    () => false,
  );
}
