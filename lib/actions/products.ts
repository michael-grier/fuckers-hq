"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import {
  type DeleteProductRecordResult,
  deleteProductRecord,
} from "@/lib/admin/product-repository";
import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidateProductSlugs } from "@/lib/catalog/cache";
import { getDb } from "@/lib/db/client";
import { products } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";
import { deleteProductImageObject } from "@/lib/r2";
import { getR2ObjectKeyFromPublicUrl, isProductImageObjectKey } from "@/lib/r2/upload-contract";
import {
  adminProductFormSchema,
  adminProductIdSchema,
  adminProductUpdateSchema,
  toProductMutationValues,
} from "@/lib/validators/product";

type CreatedProduct = {
  productId: string;
};

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}

function revalidateAdminProduct(productId: string): void {
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export async function createProduct(input: unknown): Promise<ActionResult<CreatedProduct>> {
  await requireAdmin();

  const parsed = adminProductFormSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  try {
    const [product] = await getDb()
      .insert(products)
      .values(toProductMutationValues(parsed.data))
      .returning({ id: products.id });

    if (!product) {
      throw new Error("Product insert did not return a row.");
    }

    revalidateProductSlugs([parsed.data.slug]);
    revalidateAdminProduct(product.id);

    return {
      success: true,
      data: { productId: product.id },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: "That slug is already used by another product.",
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.create-product",
    });
    throw error;
  }
}

export async function updateProduct(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminProductUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const db = getDb();
  const existingProduct = await db.query.products.findFirst({
    columns: { slug: true },
    where: (products, { eq }) => eq(products.id, parsed.data.productId),
  });

  if (!existingProduct) {
    return {
      success: false,
      message: "Product not found.",
    };
  }

  try {
    await db
      .update(products)
      .set({
        ...toProductMutationValues(parsed.data),
        updatedAt: new Date(),
      })
      .where(eq(products.id, parsed.data.productId));

    revalidateProductSlugs([existingProduct.slug, parsed.data.slug]);
    revalidateAdminProduct(parsed.data.productId);

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: "That slug is already used by another product.",
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.update-product",
    });
    throw error;
  }
}

export async function archiveProduct(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminProductIdSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const db = getDb();
  const [product] = await db
    .update(products)
    .set({
      status: "archived",
      updatedAt: new Date(),
    })
    .where(eq(products.id, parsed.data.productId))
    .returning({ slug: products.slug });

  if (!product) {
    return {
      success: false,
      message: "Product not found.",
    };
  }

  revalidateProductSlugs([product.slug]);
  revalidateAdminProduct(parsed.data.productId);

  return {
    success: true,
    data: undefined,
  };
}

const deleteRefusedMessage =
  "This product has order or checkout history and cannot be deleted. Archive it instead.";

export async function deleteProduct(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminProductIdSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  let result: DeleteProductRecordResult;

  try {
    result = await deleteProductRecord(getDb(), parsed.data.productId);
  } catch (error) {
    // A checkout can insert a reservation item between the history check and
    // the delete; the restrict FK turns that race into this clean refusal.
    if (isForeignKeyViolation(error)) {
      return { success: false, message: deleteRefusedMessage };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.delete-product",
    });
    throw error;
  }

  if (result.outcome === "not_found") {
    return { success: false, message: "Product not found." };
  }

  if (result.outcome === "active") {
    return {
      success: false,
      message: "Set the product to draft or archived before deleting it.",
    };
  }

  if (result.outcome === "has_commerce_history") {
    return { success: false, message: deleteRefusedMessage };
  }

  // After commit only: an R2 failure leaves an orphaned object to reap later,
  // never a half-deleted product.
  if (env.R2_PUBLIC_URL) {
    for (const url of result.imageUrls) {
      const objectKey = getR2ObjectKeyFromPublicUrl(env.R2_PUBLIC_URL, url);

      if (objectKey && isProductImageObjectKey(objectKey, parsed.data.productId)) {
        try {
          await deleteProductImageObject(objectKey);
        } catch (error) {
          captureServerException(error, {
            area: "r2",
            operation: "r2.delete-image-object",
          });
        }
      }
    }
  }

  revalidateProductSlugs([result.slug]);
  revalidateAdminProduct(parsed.data.productId);

  return {
    success: true,
    data: undefined,
  };
}
