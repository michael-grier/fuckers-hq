import { describe, expect, test } from "bun:test";

import { moveVariantInList } from "@/lib/admin/variant-order";
import { adminVariantMoveSchema } from "@/lib/validators/product";

const productId = "9c786325-fb57-46e3-b3ed-a60b653b3ad8";
const variantId = "3f8ee7b3-96f1-4d55-a95c-6ef7cc0cbb1a";

const variants = [
  { id: "a", position: 0 },
  { id: "b", position: 1 },
  { id: "c", position: 2 },
];

describe("moveVariantInList", () => {
  test("moves a variant up one step", () => {
    expect(moveVariantInList(variants, "b", "up")?.map((variant) => variant.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  test("moves a variant down one step", () => {
    expect(moveVariantInList(variants, "b", "down")?.map((variant) => variant.id)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  test("returns null at the edges instead of wrapping", () => {
    expect(moveVariantInList(variants, "a", "up")).toBeNull();
    expect(moveVariantInList(variants, "c", "down")).toBeNull();
  });

  test("returns null for an unknown variant", () => {
    expect(moveVariantInList(variants, "missing", "up")).toBeNull();
  });

  test("does not mutate the input list", () => {
    const input = [...variants];
    moveVariantInList(input, "b", "up");
    expect(input.map((variant) => variant.id)).toEqual(["a", "b", "c"]);
  });
});

describe("adminVariantMoveSchema", () => {
  test("accepts a valid move request", () => {
    expect(adminVariantMoveSchema.parse({ productId, variantId, direction: "up" })).toEqual({
      productId,
      variantId,
      direction: "up",
    });
  });

  test("rejects unknown directions, malformed ids, and extra fields", () => {
    expect(
      adminVariantMoveSchema.safeParse({ productId, variantId, direction: "top" }).success,
    ).toBe(false);
    expect(
      adminVariantMoveSchema.safeParse({ productId, variantId: "1", direction: "up" }).success,
    ).toBe(false);
    expect(
      adminVariantMoveSchema.safeParse({ productId, variantId, direction: "up", position: 0 })
        .success,
    ).toBe(false);
  });
});
