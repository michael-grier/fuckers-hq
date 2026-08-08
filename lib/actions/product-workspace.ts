"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionFailure, ActionResult } from "@/lib/actions/result";
import { nestedValidationFailure } from "@/lib/actions/result";
import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidateProductSlugs } from "@/lib/catalog/cache";
import { getDb } from "@/lib/db/client";
import { productImages, products, productVariants } from "@/lib/db/schema";
import { centsToDollars } from "@/lib/money";
import { captureServerException } from "@/lib/observability/server";
import { getProductImageObjectMetadata, getProductImagePublicUrl } from "@/lib/r2";
import {
  allowedProductImageTypes,
  doesProductImageKeyMatchContentType,
  MAX_PRODUCT_IMAGE_BYTES,
  productImageContentTypeSchema,
} from "@/lib/r2/upload-contract";
import {
  adminProductComposerSchema,
  adminProductWorkspaceSchema,
  toProductMutationValues,
  toVariantMutationValues,
} from "@/lib/validators/product";

type UniqueViolation = {
  code: string;
  constraintName: string | null;
  detail: string | null;
};

function asUniqueViolation(error: unknown): UniqueViolation | null {
  if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "23505") {
    return null;
  }

  const record = error as Record<string, unknown>;
  // postgres-js exposes `constraint_name`; node-postgres calls it `constraint`.
  const constraintName = record.constraint_name ?? record.constraint;

  return {
    code: "23505",
    constraintName: typeof constraintName === "string" ? constraintName : null,
    detail: typeof record.detail === "string" ? record.detail : null,
  };
}

/**
 * Maps a SKU unique violation back to the offending row so the error lands on
 * the field the admin has to change. Falls back to a form-level message when
 * the database detail is unavailable or the SKU is not in the submitted rows.
 */
function skuViolationFailure(
  violation: UniqueViolation,
  variants: ReadonlyArray<{ sku: string }>,
): ActionFailure {
  const conflictingSku = violation.detail
    ? /\(sku\)=\((.+)\) already exists/.exec(violation.detail)?.[1]
    : undefined;
  const rowIndex = conflictingSku
    ? variants.findIndex((variant) => variant.sku === conflictingSku)
    : -1;

  if (rowIndex === -1) {
    return {
      success: false,
      message: "A SKU in this list is already used by another variant.",
    };
  }

  return {
    success: false,
    message: "Please correct the highlighted fields.",
    fieldErrors: {
      [`variants.${rowIndex}.sku`]: ["This SKU is already used by another variant."],
    },
  };
}

function revalidateAdminProduct(productId: string): void {
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export type WorkspaceVariantRow = {
  variantId: string;
  name: string;
  sku: string;
  price: string;
  inventory: string;
  reservedQty: number;
};

type SavedWorkspace = {
  variants: WorkspaceVariantRow[];
};

/**
 * Saves the whole product workspace — product fields plus every variant row —
 * in one transaction. Rows with a `variantId` are updated in place; rows
 * without one are appended as new variants. Deletions stay a separate,
 * explicitly confirmed action.
 *
 * Returns the fresh variant rows so the client can reset its form with real
 * ids for the rows it just created; without that, a second save would insert
 * the same rows again.
 */
export async function saveProductWorkspace(input: unknown): Promise<ActionResult<SavedWorkspace>> {
  await requireAdmin();

  const parsed = adminProductWorkspaceSchema.safeParse(input);

  if (!parsed.success) {
    return nestedValidationFailure(parsed.error);
  }

  const db = getDb();
  const existingProduct = await db.query.products.findFirst({
    columns: { slug: true },
    where: (products, { eq }) => eq(products.id, parsed.data.productId),
  });

  if (!existingProduct) {
    return { success: false, message: "Product not found." };
  }

  try {
    const outcome = await db.transaction(async (tx) => {
      const lockedVariants = await tx
        .select({
          id: productVariants.id,
          position: productVariants.position,
          reservedQty: productVariants.reservedQty,
        })
        .from(productVariants)
        .where(eq(productVariants.productId, parsed.data.productId))
        .orderBy(asc(productVariants.position), asc(productVariants.sku))
        .for("update");
      const lockedById = new Map(lockedVariants.map((variant) => [variant.id, variant]));

      // Validate every row against the locked state before writing anything,
      // so a rejected row leaves no partial save behind.
      for (const [index, row] of parsed.data.variants.entries()) {
        if (!row.variantId) {
          continue;
        }

        const locked = lockedById.get(row.variantId);

        if (!locked) {
          return { type: "variant_missing" as const };
        }

        if (Number(row.inventory) < locked.reservedQty) {
          return { type: "below_reserved" as const, rowIndex: index };
        }
      }

      await tx
        .update(products)
        .set({ ...toProductMutationValues(parsed.data), updatedAt: new Date() })
        .where(eq(products.id, parsed.data.productId));

      let nextPosition =
        lockedVariants.length > 0
          ? Math.max(...lockedVariants.map((variant) => variant.position)) + 1
          : 0;

      for (const row of parsed.data.variants) {
        const mutationValues = toVariantMutationValues(row);

        if (row.variantId) {
          await tx
            .update(productVariants)
            .set(mutationValues)
            .where(eq(productVariants.id, row.variantId));
          continue;
        }

        await tx.insert(productVariants).values({
          productId: parsed.data.productId,
          ...mutationValues,
          position: nextPosition,
        });
        nextPosition += 1;
      }

      const freshVariants = await tx
        .select({
          id: productVariants.id,
          name: productVariants.name,
          sku: productVariants.sku,
          priceCents: productVariants.priceCents,
          inventoryQty: productVariants.inventoryQty,
          reservedQty: productVariants.reservedQty,
        })
        .from(productVariants)
        .where(eq(productVariants.productId, parsed.data.productId))
        .orderBy(asc(productVariants.position), asc(productVariants.sku));

      return { type: "saved" as const, freshVariants };
    });

    if (outcome.type === "variant_missing") {
      return {
        success: false,
        message: "A variant in this list no longer exists. Reload the page and try again.",
      };
    }

    if (outcome.type === "below_reserved") {
      return {
        success: false,
        message: "Please correct the highlighted fields.",
        fieldErrors: {
          [`variants.${outcome.rowIndex}.inventory`]: [
            "On-hand inventory cannot be lower than the reserved quantity.",
          ],
        },
      };
    }

    revalidateProductSlugs([existingProduct.slug, parsed.data.slug]);
    revalidateAdminProduct(parsed.data.productId);

    return {
      success: true,
      data: {
        variants: outcome.freshVariants.map((variant) => ({
          variantId: variant.id,
          name: variant.name,
          sku: variant.sku,
          price: centsToDollars(variant.priceCents),
          inventory: String(variant.inventoryQty),
          reservedQty: variant.reservedQty,
        })),
      },
    };
  } catch (error) {
    const violation = asUniqueViolation(error);

    if (violation) {
      if (violation.constraintName === "products_slug_unique") {
        return {
          success: false,
          message: "Please correct the highlighted fields.",
          fieldErrors: { slug: ["That slug is already used by another product."] },
        };
      }

      return skuViolationFailure(violation, parsed.data.variants);
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.save-product-workspace",
    });
    throw error;
  }
}

type ComposedProduct = {
  productId: string;
};

/**
 * Creates a product from the composer page: product fields, variant rows, and
 * any images already uploaded to R2 under the pre-generated product id, all in
 * one transaction. `intent` decides whether the product goes live immediately.
 *
 * Each claimed object key is re-verified against R2 before the insert — the
 * upload endpoint no longer proves the product exists, so this is where the
 * key contract is enforced.
 */
export async function createProductFromComposer(
  input: unknown,
): Promise<ActionResult<ComposedProduct>> {
  await requireAdmin();

  const parsed = adminProductComposerSchema.safeParse(input);

  if (!parsed.success) {
    return nestedValidationFailure(parsed.error);
  }

  for (const image of parsed.data.images) {
    const metadata = await getProductImageObjectMetadata(image.objectKey);
    const parsedContentType = productImageContentTypeSchema.safeParse(metadata?.contentType);
    const validSize =
      metadata?.size !== undefined && metadata.size > 0 && metadata.size <= MAX_PRODUCT_IMAGE_BYTES;
    const validContentType =
      parsedContentType.success &&
      doesProductImageKeyMatchContentType(image.objectKey, parsedContentType.data);

    if (!metadata || !validSize || !validContentType) {
      return {
        success: false,
        message: `Each uploaded image must be a valid ${allowedProductImageTypes.join(", ")} file no larger than 5 MB. Remove the failed image and try again.`,
      };
    }
  }

  const mutationValues = toProductMutationValues({
    slug: parsed.data.slug,
    name: parsed.data.name,
    description: parsed.data.description,
    category: parsed.data.category,
    status: parsed.data.intent === "publish" ? "active" : "draft",
  });

  try {
    await getDb().transaction(async (tx) => {
      await tx.insert(products).values({ id: parsed.data.productId, ...mutationValues });

      for (const [index, row] of parsed.data.variants.entries()) {
        await tx.insert(productVariants).values({
          productId: parsed.data.productId,
          ...toVariantMutationValues(row),
          position: index,
        });
      }

      for (const [index, image] of parsed.data.images.entries()) {
        await tx.insert(productImages).values({
          productId: parsed.data.productId,
          url: getProductImagePublicUrl(image.objectKey),
          alt: image.alt || null,
          position: index,
        });
      }
    });
  } catch (error) {
    const violation = asUniqueViolation(error);

    if (violation) {
      if (violation.constraintName === "products_pkey") {
        return {
          success: false,
          message: "This product was already created. Head back to the products list to find it.",
        };
      }

      if (violation.constraintName === "products_slug_unique") {
        return {
          success: false,
          message: "Please correct the highlighted fields.",
          fieldErrors: { slug: ["That slug is already used by another product."] },
        };
      }

      return skuViolationFailure(violation, parsed.data.variants);
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.create-product-composer",
    });
    throw error;
  }

  revalidateProductSlugs([parsed.data.slug]);
  revalidateAdminProduct(parsed.data.productId);

  return {
    success: true,
    data: { productId: parsed.data.productId },
  };
}
