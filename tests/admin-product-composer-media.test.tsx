import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

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

// Records image persistence without requiring auth or an R2 metadata lookup.
const createdImages: Array<Record<string, unknown>> = [];

mock.module("@/lib/actions/images", () => ({
  createProductImage: async (input: Record<string, unknown>) => {
    createdImages.push(input);
    return { success: true, data: undefined } as const;
  },
  deleteProductImage: async () => ({ success: true, data: undefined }) as const,
  moveProductImage: async () => ({ success: true, data: undefined }) as const,
  updateProductImage: async () => ({ success: true, data: undefined }) as const,
}));

const { ProductComposer } = await import("@/components/admin/product-composer");
const { ProductImagePicker } = await import("@/components/admin/product-image-picker");
const { ProductMediaPanel } = await import("@/components/admin/product-media-panel");

beforeEach(() => {
  createdImages.length = 0;
});

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
    expect(picker.parentElement?.className).toContain("sm:aspect-square");
    expect(screen.getByText("Choose photo")).toBeDefined();
    expect(screen.queryByText("Image file")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
  });

  test("drops the square aspect ratio beside an image card", () => {
    render(
      <ProductImagePicker
        disabled={false}
        helpId="matched-picker-help"
        inputRef={{ current: null }}
        isUploading={false}
        matchGridRow
        onFile={() => {}}
      />,
    );
    const picker = screen.getByLabelText("Choose a product photo") as HTMLInputElement;

    expect(picker.parentElement?.className).not.toContain("sm:aspect-square");
    expect(picker.parentElement?.className).toContain("self-stretch");
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

  test("uploads a valid existing-product file immediately", async () => {
    const originalFetch = globalThis.fetch;
    const objectKey =
      "products/8f1f2f5e-0f0e-4a3c-9d2b-1c7a5e6d4b3a/20000000-0000-4000-8000-000000000002-deck.jpg";
    const uploadUrl = "https://r2.example.com/signed";
    const uploadRequests: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      const requestUrl = String(input);
      uploadRequests.push(requestUrl);

      return Promise.resolve(
        requestUrl.includes("/api/admin/upload-url")
          ? Response.json({
              uploadUrl,
              objectKey,
              publicUrl: `https://images.example.com/${objectKey}`,
            })
          : new Response(null, { status: 200 }),
      );
    }) as typeof fetch;

    try {
      const picker = renderExistingProductMedia();
      const file = new File([new Uint8Array(4)], "deck.jpg", { type: "image/jpeg" });
      fireEvent.change(picker, { target: { files: [file] } });

      expect((await screen.findByRole("status")).textContent).toBe("Image added.");
      await waitFor(() => {
        expect(createdImages).toEqual([
          {
            productId: "8f1f2f5e-0f0e-4a3c-9d2b-1c7a5e6d4b3a",
            objectKey,
            alt: "",
          },
        ]);
      });
      expect(uploadRequests).toEqual(["/api/admin/upload-url", uploadUrl]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
