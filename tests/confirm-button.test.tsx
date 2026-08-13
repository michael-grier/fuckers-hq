import { afterEach, expect, mock, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

import { ConfirmButton } from "@/components/admin/confirm-button";

afterEach(cleanup);

function renderConfirmButton(onConfirm: () => void) {
  return render(
    <ConfirmButton
      confirmLabel="Yes, delete"
      confirmMessage="This cannot be undone."
      onConfirm={onConfirm}
      variant="destructive"
    >
      Delete product
    </ConfirmButton>,
  );
}

test("first click arms instead of confirming, second click confirms once", () => {
  const onConfirm = mock();
  renderConfirmButton(onConfirm);

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));

  // Arming must never run the action; it only reveals the explicit choice.
  expect(onConfirm).toHaveBeenCalledTimes(0);
  expect(screen.getByText("This cannot be undone.")).toBeDefined();

  fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));

  expect(onConfirm).toHaveBeenCalledTimes(1);
  // Confirming disarms, so the trigger is back for the next action.
  expect(screen.getByRole("button", { name: "Delete product" })).toBeDefined();
});

test("cancel disarms without confirming and restores the trigger", () => {
  const onConfirm = mock();
  renderConfirmButton(onConfirm);

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

  expect(onConfirm).toHaveBeenCalledTimes(0);
  const trigger = screen.getByRole("button", { name: "Delete product" });
  expect(screen.queryByText("This cannot be undone.")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

test("escape disarms without confirming and restores trigger focus", () => {
  const onConfirm = mock();
  renderConfirmButton(onConfirm);

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Yes, delete" }), { key: "Escape" });

  expect(onConfirm).toHaveBeenCalledTimes(0);
  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Delete product" }));
});

test("escape still disarms after focus leaves the armed controls, without yanking focus", () => {
  const onConfirm = mock();
  renderConfirmButton(onConfirm);

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
  act(() => {
    (document.activeElement as HTMLElement).blur();
  });
  fireEvent.keyDown(document.body, { key: "Escape" });

  expect(onConfirm).toHaveBeenCalledTimes(0);
  const trigger = screen.getByRole("button", { name: "Delete product" });
  // Dismissed from outside the strip, so focus stays where the operator moved it.
  expect(document.activeElement).not.toBe(trigger);
});

test("auto-reverts after the arm timeout without stealing focus", () => {
  // Capture only the component's arm timeout so React's own setTimeout usage runs untouched.
  const armCallbacks: Array<() => void> = [];
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: () => void, delay?: number, ...rest: unknown[]) => {
    if (delay === 6000) {
      armCallbacks.push(callback);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }
    return originalSetTimeout(callback, delay, ...rest);
  }) as typeof setTimeout;

  try {
    renderConfirmButton(mock());
    fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
    expect(armCallbacks.length).toBe(1);

    act(() => {
      for (const callback of armCallbacks) {
        callback();
      }
    });

    const trigger = screen.getByRole("button", { name: "Delete product" });
    expect(document.activeElement).not.toBe(trigger);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("arming moves focus to the confirm button so keyboard flow matches window.confirm", () => {
  renderConfirmButton(mock());

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));

  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Yes, delete" }));
});
