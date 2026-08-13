"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Armed state auto-reverts so a stray click minutes later cannot trigger the action.
const ARM_TIMEOUT_MS = 6000;

type ConfirmButtonProps = {
  /** Short question shown beside the confirm/cancel pair while armed. */
  confirmMessage: string;
  /** Label for the confirming button, e.g. "Yes, delete". */
  confirmLabel: string;
  /** Runs only after the second, confirming click. */
  onConfirm: () => void;
  disabled?: boolean;
  size?: React.ComponentProps<typeof Button>["size"];
  variant?: React.ComponentProps<typeof Button>["variant"];
  /**
   * Styles the armed strip red. Defaults to variant === "destructive"; set explicitly when a
   * destructive action hides behind a ghost or outline trigger.
   */
  destructive?: boolean;
  /** Applied to both the idle trigger and the armed strip, so widths like w-full carry over. */
  className?: string;
  /** Idle trigger content, including any pending label the parent swaps in. */
  children: React.ReactNode;
};

/**
 * Two-step inline confirmation that replaces window.confirm: the first click swaps the button
 * in place for a message plus explicit confirm/cancel, with no overlay. Escape or Cancel
 * restores the trigger; sitting idle auto-reverts without stealing focus.
 */
export function ConfirmButton({
  confirmMessage,
  confirmLabel,
  onConfirm,
  disabled = false,
  size,
  variant,
  destructive = variant === "destructive",
  className,
  children,
}: ConfirmButtonProps) {
  const [isArmed, setIsArmed] = useState(false);
  const messageId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Set only on explicit dismissal; the auto-revert timeout must not yank focus from wherever
  // the operator has moved on to.
  const shouldRestoreTriggerFocus = useRef(false);

  useEffect(() => {
    if (isArmed) {
      confirmRef.current?.focus();
      const timeout = setTimeout(() => setIsArmed(false), ARM_TIMEOUT_MS);
      return () => clearTimeout(timeout);
    }

    if (shouldRestoreTriggerFocus.current) {
      shouldRestoreTriggerFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [isArmed]);

  function dismiss() {
    shouldRestoreTriggerFocus.current = true;
    setIsArmed(false);
  }

  // Attached to both armed buttons rather than their container: focus always sits on one of
  // them while armed, and buttons are interactive elements so key handlers belong there.
  function dismissOnEscape(event: React.KeyboardEvent) {
    if (event.key === "Escape") {
      dismiss();
    }
  }

  if (!isArmed) {
    return (
      <Button
        className={className}
        disabled={disabled}
        onClick={() => setIsArmed(true)}
        ref={triggerRef}
        size={size}
        type="button"
        variant={variant}
      >
        {children}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border py-1.5 pr-1.5 pl-3",
        destructive ? "border-destructive/50 bg-destructive/5" : "border-input bg-secondary",
        className,
      )}
    >
      <p
        className={cn("font-medium text-sm", destructive ? "text-destructive" : "text-foreground")}
        id={messageId}
      >
        {confirmMessage}
      </p>
      <div className="flex gap-2">
        <Button
          aria-describedby={messageId}
          disabled={disabled}
          onClick={() => {
            setIsArmed(false);
            onConfirm();
          }}
          onKeyDown={dismissOnEscape}
          ref={confirmRef}
          size="sm"
          type="button"
          variant={destructive ? "destructive" : "default"}
        >
          {confirmLabel}
        </Button>
        <Button
          disabled={disabled}
          onClick={dismiss}
          onKeyDown={dismissOnEscape}
          size="sm"
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
