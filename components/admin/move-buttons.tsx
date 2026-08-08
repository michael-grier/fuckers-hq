"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { VariantMoveDirection } from "@/lib/admin/variant-order";

type MoveButtonsProps = {
  canMoveUp: boolean;
  canMoveDown: boolean;
  disabled?: boolean;
  /** Accessible name suffix, e.g. the variant or image name being moved. */
  itemLabel: string;
  onMove: (direction: VariantMoveDirection) => void;
};

/**
 * The up/down reorder arrow pair used by variants and images. When an item
 * reaches either end of the list the arrow that was just pressed becomes
 * disabled and the browser drops focus to <body>; this hands focus to the
 * opposite arrow so keyboard users keep their place.
 */
export function MoveButtons({
  canMoveUp,
  canMoveDown,
  disabled = false,
  itemLabel,
  onMove,
}: MoveButtonsProps) {
  const moveUpButtonRef = useRef<HTMLButtonElement>(null);
  const moveDownButtonRef = useRef<HTMLButtonElement>(null);
  const pendingMoveFocusRef = useRef<VariantMoveDirection | null>(null);

  useEffect(() => {
    const direction = pendingMoveFocusRef.current;

    if (!direction) {
      return;
    }

    if (document.activeElement !== document.body) {
      // Focus was kept on the arrow, or the user moved it deliberately.
      pendingMoveFocusRef.current = null;
      return;
    }

    const pressedButton = direction === "up" ? moveUpButtonRef.current : moveDownButtonRef.current;
    const fallbackButton = direction === "up" ? moveDownButtonRef.current : moveUpButtonRef.current;
    const target = pressedButton?.disabled ? fallbackButton : pressedButton;

    if (target && !target.disabled) {
      target.focus();
      pendingMoveFocusRef.current = null;
    }
  });

  function handleMove(direction: VariantMoveDirection) {
    // Recorded before the reorder renders so the effect above can restore
    // focus if this arrow ends up disabled at the edge of the list.
    pendingMoveFocusRef.current = direction;
    onMove(direction);
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        className="size-8"
        disabled={disabled || !canMoveUp}
        onClick={() => handleMove("up")}
        ref={moveUpButtonRef}
        size="icon"
        type="button"
        variant="outline"
      >
        <ChevronUp aria-hidden="true" />
        <span className="sr-only">Move {itemLabel} up</span>
      </Button>
      <Button
        className="size-8"
        disabled={disabled || !canMoveDown}
        onClick={() => handleMove("down")}
        ref={moveDownButtonRef}
        size="icon"
        type="button"
        variant="outline"
      >
        <ChevronDown aria-hidden="true" />
        <span className="sr-only">Move {itemLabel} down</span>
      </Button>
    </div>
  );
}
