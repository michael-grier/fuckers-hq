"use client";

import { useLayoutEffect, useRef } from "react";

const moveDurationMs = 220;

type ReorderableListProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Animates direct children that carry `data-reorder-key` when their order
 * changes, using the FLIP technique: each pass records every child's offset,
 * and the next pass animates from the recorded offset back to zero.
 *
 * Offsets are read with offsetTop rather than getBoundingClientRect so a page
 * scroll between renders cannot corrupt the measured delta.
 */
export function ReorderableList({ children, className }: ReorderableListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousOffsets = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const items = container.querySelectorAll<HTMLElement>("[data-reorder-key]");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Rebuilt each pass so keys for removed items do not accumulate.
    const nextOffsets = new Map<string, number>();

    for (const item of items) {
      const key = item.dataset.reorderKey;

      if (!key) {
        continue;
      }

      const nextOffset = item.offsetTop;
      const previousOffset = previousOffsets.current.get(key);
      nextOffsets.set(key, nextOffset);

      if (prefersReducedMotion || previousOffset === undefined) {
        continue;
      }

      const delta = previousOffset - nextOffset;

      if (Math.abs(delta) < 1) {
        continue;
      }

      item.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
        duration: moveDurationMs,
        easing: "ease-out",
      });
    }

    previousOffsets.current = nextOffsets;
  });

  return (
    <div className={className} ref={containerRef}>
      {children}
    </div>
  );
}
