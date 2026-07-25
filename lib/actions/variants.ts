"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/actions/result";
import { validationFailure } from "@/lib/actions/result";
import { requireAdmin } from "@/lib/auth/require-admin";
import { revalidateProduct } from "@/lib/catalog/cache";
import { getDb } from "@/lib/db/client";
import { inventoryReservationItems, inventoryReservations, productVariants } from "@/lib/db/schema";
import { captureServerException } from "@/lib/observability/server";
import {
  adminVariantCreateSchema,
  adminVariantDeleteSchema,
  adminVariantUpdateSchema,
  toVariantMutationValues,
} from "@/lib/validators/product";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function isForeignKeyViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23503";
}

function revalidateAdminVariant(productId: string, slug: string): void {
  revalidateProduct(slug);
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export async function createVariant(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminVariantCreateSchema.safeParse(input);

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

  try {
    await db.insert(productVariants).values({
      productId: parsed.data.productId,
      ...toVariantMutationValues(parsed.data),
    });

    revalidateAdminVariant(parsed.data.productId, product.slug);

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: "That SKU is already used by another variant.",
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.create-variant",
    });
    throw error;
  }
}

export async function updateVariant(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminVariantUpdateSchema.safeParse(input);

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

  try {
    const mutationValues = toVariantMutationValues(parsed.data);
    const result = await db.transaction(async (tx) => {
      const [variant] = await tx
        .select({
          id: productVariants.id,
          reservedQty: productVariants.reservedQty,
        })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.id, parsed.data.variantId),
            eq(productVariants.productId, parsed.data.productId),
          ),
        )
        .for("update");

      if (!variant) {
        return "not_found" as const;
      }

      if (mutationValues.inventoryQty < variant.reservedQty) {
        return "below_reserved" as const;
      }

      await tx
        .update(productVariants)
        .set(mutationValues)
        .where(eq(productVariants.id, variant.id));

      return "updated" as const;
    });

    if (result === "not_found") {
      return { success: false, message: "Variant not found." };
    }

    if (result === "below_reserved") {
      return {
        success: false,
        message: "On-hand inventory cannot be lower than the reserved quantity.",
      };
    }

    revalidateAdminVariant(parsed.data.productId, product.slug);

    return {
      success: true,
      data: undefined,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        success: false,
        message: "That SKU is already used by another variant.",
      };
    }

    captureServerException(error, {
      area: "admin",
      operation: "admin.update-variant",
    });
    throw error;
  }
}

export async function deleteVariant(input: unknown): Promise<ActionResult> {
  await requireAdmin();

  const parsed = adminVariantDeleteSchema.safeParse(input);

  if (!parsed.success) {
    return validationFailure(parsed.error);
  }

  const db = getDb();
  const product = await db.query.products.findFirst({
    columns: { slug: true, status: true },
    where: (products, { eq }) => eq(products.id, parsed.data.productId),
  });

  if (!product) {
    return {
      success: false,
      message: "Product not found.",
    };
  }

  if (product.status === "active") {
    return {
      success: false,
      message: "Set the product to draft or archived before deleting a variant.",
    };
  }

  let deletedVariants: Array<{ id: string }>;

  try {
    deletedVariants = await db
      .delete(productVariants)
      .where(
        and(
          eq(productVariants.id, parsed.data.variantId),
          eq(productVariants.productId, parsed.data.productId),
          eq(productVariants.reservedQty, 0),
          sql`not exists (
            select 1
            from ${inventoryReservationItems}
            inner join ${inventoryReservations}
              on ${inventoryReservations.id} = ${inventoryReservationItems.reservationId}
            where ${inventoryReservationItems.variantId} = ${parsed.data.variantId}
              and ${inventoryReservations.status} in ('provisioning', 'active', 'awaiting_payment')
          )`,
        ),
      )
      .returning({ id: productVariants.id });
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return {
        success: false,
        message: "This variant has active reserved inventory and cannot be deleted.",
      };
    }

    throw error;
  }

  if (deletedVariants.length !== 1) {
    const variant = await db.query.productVariants.findFirst({
      columns: { reservedQty: true },
      where: (variants, { and, eq }) =>
        and(eq(variants.id, parsed.data.variantId), eq(variants.productId, parsed.data.productId)),
    });

    return {
      success: false,
      message: variant
        ? "This variant has active reserved inventory and cannot be deleted."
        : "Variant not found.",
    };
  }

  revalidateAdminVariant(parsed.data.productId, product.slug);

  return {
    success: true,
    data: undefined,
  };
}
