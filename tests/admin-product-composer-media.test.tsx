import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

mock.module("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: () => {
    throw new Error("redirect");
  },
  usePathname: () => "/admin/products/new",
  useSearchParams: () => new URLSearchParams(),
}));

const { ProductComposer } = await import("@/components/admin/product-composer");
const { ProductMediaPanel } = await import("@/components/admin/product-media-panel");

afterEach(cleanup);

function renderComposer() {
  render(<ProductComposer r2Configured />);
  return screen.getByLabelText("Choose a product photo") as HTMLInputElement;
}

function renderExistingProductMedia() {
  render(
    <ProductMediaPanel
      images={[]}
      productId="8f1f2f5e-0f0e-4a3c-9d2b-1c7a5e6d4b3a"
      productName="Street Deck"
      r2Configured
    />,
  );
  return screen.getByLabelText("Choose a product photo") as HTMLInputElement;
}

function unsupportedPhoto() {
  return new File(["image"], "test.gif", { type: "image/gif" });
}

describe("new product image picker", () => {
  test("exposes a focusable native file input instead of a synthetic button", () => {
    const picker = renderComposer();

    expect(picker.type).toBe("file");
    expect(picker.tabIndex).toBe(0);
    expect(screen.getByText("Choose photo")).toBeDefined();
  });

  test("routes a native picker selection through image validation", async () => {
    const picker = renderComposer();
    fireEvent.change(picker, { target: { files: [unsupportedPhoto()] } });

    expect(
      await screen.findByText("Use a JPEG, PNG, WebP, or AVIF image no larger than 5 MB."),
    ).toBeDefined();
  });

  test("keeps drag-and-drop validation on the picker tile", async () => {
    const picker = renderComposer();
    fireEvent.drop(picker.parentElement as HTMLElement, {
      dataTransfer: { files: [unsupportedPhoto()] },
    });

    expect(
      await screen.findByText("Use a JPEG, PNG, WebP, or AVIF image no larger than 5 MB."),
    ).toBeDefined();
  });
});

describe("existing product image picker", () => {
  test("uses the same mobile-safe tile instead of the legacy upload form", () => {
    const picker = renderExistingProductMedia();

    expect(picker.type).toBe("file");
    expect(picker.className).toContain("opacity-0");
    expect(screen.getByText("Choose photo")).toBeDefined();
    expect(screen.queryByText("Image file")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
  });

  test("routes a native picker selection through image validation", async () => {
    const picker = renderExistingProductMedia();
    fireEvent.change(picker, { target: { files: [unsupportedPhoto()] } });

    expect(
      await screen.findByText("Use a JPEG, PNG, WebP, or AVIF image no larger than 5 MB."),
    ).toBeDefined();
  });

  test("keeps drag-and-drop validation on the unified picker tile", async () => {
    const picker = renderExistingProductMedia();
    fireEvent.drop(picker.parentElement as HTMLElement, {
      dataTransfer: { files: [unsupportedPhoto()] },
    });

    expect(
      await screen.findByText("Use a JPEG, PNG, WebP, or AVIF image no larger than 5 MB."),
    ).toBeDefined();
  });
});
