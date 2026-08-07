import { describe, expect, test } from "bun:test";
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
