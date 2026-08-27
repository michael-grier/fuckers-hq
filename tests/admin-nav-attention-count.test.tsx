import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { AdminNavAttentionCount } from "@/components/admin/admin-nav-attention-count";

afterEach(cleanup);

describe("admin navigation attention count", () => {
  test("renders an accessible red counter for orders needing action", () => {
    render(<AdminNavAttentionCount count={3} />);

    const counter = screen.getByLabelText("3 orders need action");

    expect(counter.textContent).toBe("3");
    expect(counter.classList.contains("bg-destructive")).toBe(true);
    expect(counter.classList.contains("rounded-full")).toBe(true);
  });

  test("renders nothing when every order is clear", () => {
    const { container } = render(<AdminNavAttentionCount count={0} />);

    expect(container.childElementCount).toBe(0);
  });
});
