import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

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
  expect(screen.getByRole("button", { name: "Delete product" })).toBeDefined();
  expect(screen.queryByText("This cannot be undone.")).toBeNull();
});

test("escape disarms without confirming", () => {
  const onConfirm = mock();
  renderConfirmButton(onConfirm);

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));
  fireEvent.keyDown(screen.getByRole("button", { name: "Yes, delete" }), { key: "Escape" });

  expect(onConfirm).toHaveBeenCalledTimes(0);
  expect(screen.getByRole("button", { name: "Delete product" })).toBeDefined();
});

test("arming moves focus to the confirm button so keyboard flow matches window.confirm", () => {
  renderConfirmButton(mock());

  fireEvent.click(screen.getByRole("button", { name: "Delete product" }));

  expect(document.activeElement).toBe(screen.getByRole("button", { name: "Yes, delete" }));
});
