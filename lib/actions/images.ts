"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import { deleteProductImageRecord } from "@/lib/admin/product-image-repository";
import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidateProduct } from "@/lib/catalog/cache";
import { getDb } from "@/lib/db/client";
import { productImages, products } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { captureServerException } from "@/lib/observability/server";
import {
  deleteProductImageObject,
  getProductImageObjectMetadata,
  getProductImagePublicUrl,
} from "@/lib/r2";
import {
  allowedProductImageTypes,
  doesProductImageKeyMatchContentType,
  getR2ObjectKeyFromPublicUrl,
  isProductImageObjectKey,
  MAX_PRODUCT_IMAGE_BYTES,
  productImageContentTypeSchema,
} from "@/lib/r2/upload-contract";
import {
  adminProductImageCreateSchema,
  adminProductImageDeleteSchema,
  adminProductImageUpdateSchema,
} from "@/lib/validators/product";

function revalidateAdminProductImage(productId: string, slug: string): void {
  revalidateProduct(slug);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

async function deleteObjectBestEffort(objectKey: string): Promise<void> {
  try {
    await deleteProductImageObject(objectKey);
  } catch (error) {
    captureServerException(error, {
      area: "r2",
      operation: "r2.delete-image-object",
    });
  }
}

export async function createProductImage(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminProductImageCreateSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const db = getDb();
  const product = await db.query.products.findFirst({
    columns: { slug: true },
    where: (products, { eq }) => eq(products.id, parsed.data.productId),
  });

  if (!product) {
    return {
      success: false,
      message: "Product not found.",
    };
  }

  const metadata = await getProductImageObjectMetadata(parsed.data.objectKey);
  const parsedContentType = productImageContentTypeSchema.safeParse(metadata?.contentType);
  const validSize =
    metadata?.size !== undefined && metadata.size > 0 && metadata.size <= MAX_PRODUCT_IMAGE_BYTES;
  const validContentType =
    parsedContentType.success &&
    doesProductImageKeyMatchContentType(parsed.data.objectKey, parsedContentType.data);

  if (!metadata || !validSize || !validContentType) {
    await deleteObjectBestEffort(parsed.data.objectKey);

    return {
      success: false,
      message: `Uploaded image must be a valid ${allowedProductImageTypes.join(", ")} file no larger than 5 MB.`,
    };
  }

  const [positionRow] = await db
    .select({ maximum: max(productImages.position) })
    .from(productImages)
    .where(eq(productImages.productId, parsed.data.productId));
  const position = (positionRow?.maximum ?? -1) + 1;

  try {
    await db.insert(productImages).values({
      productId: parsed.data.productId,
      url: getProductImagePublicUrl(parsed.data.objectKey),
      alt: parsed.data.alt || null,
      position,
    });
  } catch (error) {
    await deleteObjectBestEffort(parsed.data.objectKey);
    captureServerException(error, {
      area: "admin",
      operation: "admin.create-product-image",
    });
    throw error;
  }

  revalidateAdminProductImage(parsed.data.productId, product.slug);

  return {
    success: true,
    data: undefined,
  };
}

export async function updateProductImage(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminProductImageUpdateSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const db = getDb();
  const [image] = await db
    .select({ slug: products.slug })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(
      and(
        eq(productImages.id, parsed.data.imageId),
        eq(productImages.productId, parsed.data.productId),
      ),
    )
    .limit(1);

  if (!image) {
    return {
      success: false,
      message: "Product image not found.",
    };
  }

  await db
    .update(productImages)
    .set({
      alt: parsed.data.alt || null,
      position: Number(parsed.data.position),
    })
    .where(
      and(
        eq(productImages.id, parsed.data.imageId),
        eq(productImages.productId, parsed.data.productId),
      ),
    );

  revalidateAdminProductImage(parsed.data.productId, image.slug);

  return {
    success: true,
    data: undefined,
  };
}

export async function deleteProductImage(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminProductImageDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const db = getDb();
  const image = await deleteProductImageRecord(db, parsed.data.productId, parsed.data.imageId);

  if (!image) {
    return {
      success: false,
      message: "Product image not found.",
    };
  }

  const objectKey = env.R2_PUBLIC_URL
    ? getR2ObjectKeyFromPublicUrl(env.R2_PUBLIC_URL, image.url)
    : null;

  if (objectKey && isProductImageObjectKey(objectKey, parsed.data.productId)) {
    await deleteObjectBestEffort(objectKey);
  }

  revalidateAdminProductImage(parsed.data.productId, image.slug);

  return {
    success: true,
    data: undefined,
  };
}
