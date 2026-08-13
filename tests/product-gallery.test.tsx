import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

import { ProductGallery } from "@/components/shop/product-gallery";

afterEach(cleanup);

const image = (n: number) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  url: `https://images.example/product-${n}.jpg`,
  alt: `View ${n}`,
  position: n,
});

describe("ProductGallery", () => {
  test("renders no carousel chrome for a single image", () => {
    render(<ProductGallery images={[image(1)]} name="Flame Crewneck" />);

    expect(screen.getByRole("img", { name: "View 1" })).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("falls back to the product name when there are no images", () => {
    render(<ProductGallery images={[]} name="Flame Crewneck" />);

    expect(screen.getByText("Flame Crewneck")).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
  });

  test("renders a carousel with counter, arrows, and dots for multiple images", () => {
    render(<ProductGallery images={[image(1), image(2), image(3)]} name="Flame Crewneck" />);

    expect(screen.getByRole("region")).toBeTruthy();
    expect(screen.getAllByRole("group").length).toBe(3);
    expect(screen.getByText("1 / 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Previous slide" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next slide" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Go to image \d/ }).length).toBe(3);

    // The active dot must be exposed to assistive tech, not just styled.
    const dots = screen.getAllByRole("button", { name: /Go to image \d/ });
    expect(dots[0]?.getAttribute("aria-current")).toBe("true");
    expect(dots[1]?.getAttribute("aria-current")).toBeNull();
  });
});
