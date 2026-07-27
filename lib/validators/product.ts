import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-zod";
import { z } from "zod";

import { isProductCategory, productCategoryValues } from "@/lib/catalog/categories";
import { productImages, productStatusValues, products, productVariants } from "@/lib/db/schema";
import { dollarsToCents } from "@/lib/money";
import { isProductImageObjectKey, productImageObjectKeySchema } from "@/lib/r2/upload-contract";
import { adminEntityIdSchema } from "@/lib/validators/admin";

const postgresIntegerMax = 2_147_483_647;

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");

export const productSelectSchema = createSelectSchema(products);

export const productInsertSchema = createInsertSchema(products, {
  slug: slugSchema,
  name: (schema) => schema.trim().min(1).max(160),
  description: (schema) => schema.trim().max(4000),
  category: (schema) =>
    schema.trim().max(80).refine(isProductCategory, "Choose Hardgoods, Softgoods, or Accessories."),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const productUpdateSchema = createUpdateSchema(products, {
  slug: slugSchema,
  name: (schema) => schema.trim().min(1).max(160),
  description: (schema) => schema.trim().max(4000),
  category: (schema) =>
    schema.trim().max(80).refine(isProductCategory, "Choose Hardgoods, Softgoods, or Accessories."),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const productVariantSelectSchema = createSelectSchema(productVariants);

export const productVariantInsertSchema = createInsertSchema(productVariants, {
  name: (schema) => schema.trim().min(1).max(120),
  sku: (schema) => schema.trim().min(1).max(120),
  priceCents: (schema) => schema.int().nonnegative(),
  inventoryQty: (schema) => schema.int().nonnegative(),
}).omit({
  id: true,
  reservedQty: true,
});

export const productVariantUpdateSchema = createUpdateSchema(productVariants, {
  name: (schema) => schema.trim().min(1).max(120),
  sku: (schema) => schema.trim().min(1).max(120),
  priceCents: (schema) => schema.int().nonnegative(),
  inventoryQty: (schema) => schema.int().nonnegative(),
}).omit({
  id: true,
  reservedQty: true,
});

export const productImageSelectSchema = createSelectSchema(productImages);

export const productImageInsertSchema = createInsertSchema(productImages, {
  url: (schema) => schema.url(),
  alt: (schema) => schema.trim().max(180),
  position: (schema) => schema.int().nonnegative(),
}).omit({
  id: true,
});

export const productImageUpdateSchema = createUpdateSchema(productImages, {
  url: (schema) => schema.url(),
  alt: (schema) => schema.trim().max(180),
  position: (schema) => schema.int().nonnegative(),
}).omit({
  id: true,
});

const priceDollarsSchema = z
  .string()
  .trim()
  .min(1, "Price is required.")
  .superRefine((value, context) => {
    try {
      if (dollarsToCents(value) > postgresIntegerMax) {
        context.addIssue({
          code: "custom",
          message: "Price is too large.",
        });
      }
    } catch {
      context.addIssue({
        code: "custom",
        message: "Use a non-negative dollar amount with no more than two decimals.",
      });
    }
  });

const inventoryInputSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Inventory must be a non-negative whole number.")
  .refine((value) => Number(value) <= postgresIntegerMax, "Inventory is too large.");

export const adminProductFormSchema = z
  .object({
    slug: productInsertSchema.shape.slug,
    name: productInsertSchema.shape.name,
    description: z.string().trim().max(4000),
    category: z
      .string()
      .trim()
      .refine(isProductCategory, "Choose Hardgoods, Softgoods, or Accessories."),
    status: z.enum(productStatusValues),
  })
  .strict();

export const adminProductUpdateSchema = adminProductFormSchema.extend({
  productId: adminEntityIdSchema,
});

export const adminProductIdSchema = z
  .object({
    productId: adminEntityIdSchema,
  })
  .strict();

export const adminVariantFormSchema = z
  .object({
    name: productVariantInsertSchema.shape.name,
    sku: productVariantInsertSchema.shape.sku,
    price: priceDollarsSchema,
    inventory: inventoryInputSchema,
  })
  .strict();

export const adminVariantCreateSchema = adminVariantFormSchema.extend({
  productId: adminEntityIdSchema,
});

export const adminVariantUpdateSchema = adminVariantCreateSchema.extend({
  variantId: adminEntityIdSchema,
});

export const adminVariantDeleteSchema = z
  .object({
    productId: adminEntityIdSchema,
    variantId: adminEntityIdSchema,
  })
  .strict();

export const adminImageUploadFormSchema = z
  .object({
    alt: z.string().trim().max(180),
  })
  .strict();

export const adminProductImageCreateSchema = z
  .object({
    productId: adminEntityIdSchema,
    objectKey: productImageObjectKeySchema,
    alt: z.string().trim().max(180),
  })
  .strict()
  .refine((input) => isProductImageObjectKey(input.objectKey, input.productId), {
    message: "Image object key does not belong to this product.",
    path: ["objectKey"],
  });

export const adminProductImageFormSchema = z
  .object({
    alt: z.string().trim().max(180),
    position: z
      .string()
      .trim()
      .regex(/^\d+$/, "Position must be a non-negative whole number.")
      .refine((value) => Number(value) <= postgresIntegerMax, "Position is too large."),
  })
  .strict();

export const adminProductImageUpdateSchema = adminProductImageFormSchema.extend({
  productId: adminEntityIdSchema,
  imageId: adminEntityIdSchema,
});

export const adminProductImageDeleteSchema = z
  .object({
    productId: adminEntityIdSchema,
    imageId: adminEntityIdSchema,
  })
  .strict();

export function toProductMutationValues(input: AdminProductFormValues): ProductInsert {
  return {
    slug: input.slug,
    name: input.name,
    description: input.description || null,
    category: z.enum(productCategoryValues).parse(input.category),
    status: input.status,
  };
}

export function toVariantMutationValues(input: AdminVariantFormInput) {
  return {
    name: input.name,
    sku: input.sku,
    priceCents: dollarsToCents(input.price),
    inventoryQty: Number(input.inventory),
  };
}

export type ProductInsert = z.infer<typeof productInsertSchema>;
export type ProductUpdate = z.infer<typeof productUpdateSchema>;
export type ProductVariantInsert = z.infer<typeof productVariantInsertSchema>;
export type ProductVariantUpdate = z.infer<typeof productVariantUpdateSchema>;
export type ProductImageInsert = z.infer<typeof productImageInsertSchema>;
export type ProductImageUpdate = z.infer<typeof productImageUpdateSchema>;
export type AdminProductFormInput = z.input<typeof adminProductFormSchema>;
export type AdminProductFormValues = z.output<typeof adminProductFormSchema>;
export type AdminVariantFormInput = z.infer<typeof adminVariantFormSchema>;
export type AdminImageUploadFormInput = z.infer<typeof adminImageUploadFormSchema>;
export type AdminProductImageFormInput = z.infer<typeof adminProductImageFormSchema>;
