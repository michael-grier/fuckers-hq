import { describe, expect, test } from "bun:test";
import { uploadProductImageFile } from "@/lib/admin/product-image-upload";
import {
  buildR2PublicUrl,
  createProductImageObjectKey,
  doesProductImageKeyMatchContentType,
  getR2ObjectKeyFromPublicUrl,
  MAX_PRODUCT_IMAGE_BYTES,
  productImageUploadRequestSchema,
} from "@/lib/r2/upload-contract";
import {
  adminProductImageCreateSchema,
  adminProductImageFormSchema,
} from "@/lib/validators/product";

const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";
const otherProductId = "7935da4e-5a60-42e4-b3f3-3a57c956a352";
const objectId = "34b62019-8c2f-4b83-9144-f60c96eb17da";

describe("R2 product image upload contract", () => {
  test("accepts supported images up to 5 MB", () => {
    expect(
      productImageUploadRequestSchema.parse({
        productId,
        fileName: "Street Deck.webp",
        contentType: "image/webp",
        size: MAX_PRODUCT_IMAGE_BYTES,
      }),
    ).toEqual({
      productId,
      fileName: "Street Deck.webp",
      contentType: "image/webp",
      size: MAX_PRODUCT_IMAGE_BYTES,
    });
  });

  test("rejects unsupported types, oversized files, and invalid product IDs", () => {
    expect(() =>
      productImageUploadRequestSchema.parse({
        productId,
        fileName: "deck.svg",
        contentType: "image/svg+xml",
        size: 100,
      }),
    ).toThrow();
    expect(() =>
      productImageUploadRequestSchema.parse({
        productId,
        fileName: "deck.jpg",
        contentType: "image/jpeg",
        size: MAX_PRODUCT_IMAGE_BYTES + 1,
      }),
    ).toThrow();
    expect(() =>
      productImageUploadRequestSchema.parse({
        productId: "not-a-product-id",
        fileName: "deck.jpg",
        contentType: "image/jpeg",
        size: 100,
      }),
    ).toThrow();
  });

  test("creates a unique product-scoped key with a content-derived extension", () => {
    const objectKey = createProductImageObjectKey(
      {
        productId,
        fileName: "../My Cool Déck.PNG",
        contentType: "image/png",
      },
      objectId,
    );

    expect(objectKey).toBe(`products/${productId}/${objectId}-my-cool-deck.png`);
    expect(doesProductImageKeyMatchContentType(objectKey, "image/png")).toBe(true);
    expect(doesProductImageKeyMatchContentType(objectKey, "image/jpeg")).toBe(false);
  });

  test("rejects an uploaded object key belonging to a different product", () => {
    const objectKey = createProductImageObjectKey(
      {
        productId: otherProductId,
        fileName: "deck.jpg",
        contentType: "image/jpeg",
      },
      objectId,
    );

    expect(() =>
      adminProductImageCreateSchema.parse({
        productId,
        objectKey,
        alt: "Street deck",
      }),
    ).toThrow();
  });

  test("rejects malformed UUID segments in object keys", () => {
    expect(() =>
      adminProductImageCreateSchema.parse({
        productId,
        objectKey: `products/${productId}/------------------------------------deck.jpg`,
        alt: "Street deck",
      }),
    ).toThrow();
  });

  test("round-trips keys only for the configured public URL", () => {
    const objectKey = `products/${productId}/${objectId}-street-deck.jpg`;
    const publicUrl = buildR2PublicUrl("https://images.example.com/shop", objectKey);

    expect(publicUrl).toBe(`https://images.example.com/shop/${objectKey}`);
    expect(getR2ObjectKeyFromPublicUrl("https://images.example.com/shop", publicUrl)).toBe(
      objectKey,
    );
    expect(
      getR2ObjectKeyFromPublicUrl(
        "https://images.example.com/shop",
        `https://other.example.com/${objectKey}`,
      ),
    ).toBeNull();
  });
});

describe("admin product image form contract", () => {
  test("accepts alt text and rejects the retired hand-typed position field", () => {
    expect(adminProductImageFormSchema.parse({ alt: "Deck top" })).toEqual({
      alt: "Deck top",
    });
    // Ordering is now owned by the move action; a stray position must not pass.
    expect(() => adminProductImageFormSchema.parse({ alt: "Deck top", position: "0" })).toThrow();
  });
});

describe("uploadProductImageFile", () => {
  const request = {
    productId: "9c786325-fb57-46e3-b3ed-a60b653b3ad8",
    fileName: "deck-front.jpg",
    contentType: "image/jpeg",
    size: 1024,
  } as const;
  const file = new File([new Uint8Array(4)], "deck-front.jpg", { type: "image/jpeg" });

  async function withStubbedFetch<T>(
    responder: (input: string) => Response,
    run: () => Promise<T>,
  ): Promise<T> {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL) =>
      Promise.resolve(responder(String(input)))) as typeof fetch;

    try {
      return await run();
    } finally {
      globalThis.fetch = originalFetch;
    }
  }

  test("returns a failure when the presign response is not JSON", async () => {
    // A proxy error page rather than the route's JSON body: json() would throw
    // and the caller would blame the R2 configuration instead of the gateway.
    const result = await withStubbedFetch(
      () => new Response("<html>502 Bad Gateway</html>", { status: 502 }),
      () => uploadProductImageFile(request, file),
    );

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error).toContain("502");
  });

  test("returns the object key once the upload succeeds", async () => {
    const objectKey = `products/${request.productId}/20000000-0000-4000-8000-000000000002-deck-front.jpg`;
    const result = await withStubbedFetch(
      (input) =>
        input.includes("/api/admin/upload-url")
          ? Response.json({
              uploadUrl: "https://r2.example.com/signed",
              objectKey,
              publicUrl: `https://images.example.com/${objectKey}`,
            })
          : new Response(null, { status: 200 }),
      () => uploadProductImageFile(request, file),
    );

    expect(result).toEqual({ success: true, objectKey });
  });

  test("reports an upload that R2 rejects", async () => {
    const objectKey = `products/${request.productId}/20000000-0000-4000-8000-000000000002-deck-front.jpg`;
    const result = await withStubbedFetch(
      (input) =>
        input.includes("/api/admin/upload-url")
          ? Response.json({
              uploadUrl: "https://r2.example.com/signed",
              objectKey,
              publicUrl: `https://images.example.com/${objectKey}`,
            })
          : new Response(null, { status: 403 }),
      () => uploadProductImageFile(request, file),
    );

    expect(result.success).toBe(false);
  });
});
