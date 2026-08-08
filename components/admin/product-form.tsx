"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { archiveProduct, createProduct, updateProduct } from "@/lib/actions/products";
import type { ActionFailure } from "@/lib/actions/result";
import {
  getProductSubcategoryOptions,
  isProductCategory,
  productCategories,
} from "@/lib/catalog/categories";
import {
  type AdminProductFormInput,
  type AdminProductFormValues,
  adminProductFormSchema,
} from "@/lib/validators/product";

type ProductFormProps = {
  defaultValues: AdminProductFormInput;
  productId?: string;
};

const productFieldNames = [
  "name",
  "slug",
  "description",
  "category",
  "subcategory",
  "status",
] as const;

export function ProductForm({ defaultValues, productId }: ProductFormProps) {
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);
  const form = useForm<AdminProductFormInput, unknown, AdminProductFormValues>({
    defaultValues,
    resolver: zodResolver(adminProductFormSchema),
  });

  function showActionFailure(result: ActionFailure) {
    for (const field of productFieldNames) {
      const message = result.fieldErrors?.[field]?.[0];

      if (message) {
        form.setError(field, { message, type: "server" });
      }
    }

    setActionError(result.message);
  }

  async function onSubmit(values: AdminProductFormValues) {
    setActionError(null);
    setSuccessMessage(null);

    if (!productId) {
      const result = await createProduct(values);

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      router.push(`/admin/products/${result.data.productId}` as Route);
      return;
    }

    const result = await updateProduct({ ...values, productId });

    if (!result.success) {
      showActionFailure(result);
      return;
    }

    form.reset(values);
    setSuccessMessage("Product saved.");
    router.refresh();
  }

  async function onArchive() {
    if (!productId || !window.confirm("Archive this product and remove it from the storefront?")) {
      return;
    }

    setActionError(null);
    setSuccessMessage(null);
    setIsArchiving(true);

    try {
      const result = await archiveProduct({ productId });

      if (!result.success) {
        showActionFailure(result);
        return;
      }

      const archivedValues = { ...form.getValues(), status: "archived" as const };
      form.reset(archivedValues);
      setSuccessMessage("Product archived.");
      router.refresh();
    } finally {
      setIsArchiving(false);
    }
  }

  const errors = form.formState.errors;
  const selectedStatus = form.watch("status");
  const selectedCategory = form.watch("category");
  const subcategoryOptions = isProductCategory(selectedCategory)
    ? getProductSubcategoryOptions(selectedCategory)
    : [];

  return (
    <form className="space-y-6" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <div className="grid gap-6 md:grid-cols-2">
        <FormField error={errors.name?.message} id="name" label="Name">
          <Input
            aria-describedby={errors.name ? "name-error" : undefined}
            aria-invalid={Boolean(errors.name)}
            id="name"
            {...form.register("name")}
          />
        </FormField>

        <FormField error={errors.slug?.message} id="slug" label="Slug">
          <Input
            aria-describedby={errors.slug ? "slug-error" : "slug-help"}
            aria-invalid={Boolean(errors.slug)}
            autoCapitalize="none"
            id="slug"
            spellCheck={false}
            {...form.register("slug")}
          />
          {!errors.slug ? (
            <p className="mt-1 text-muted-foreground text-xs" id="slug-help">
              Lowercase letters, numbers, and hyphens only.
            </p>
          ) : null}
        </FormField>

        <FormField error={errors.category?.message} id="category" label="Category">
          <select
            aria-describedby={errors.category ? "category-error" : "category-help"}
            aria-invalid={Boolean(errors.category)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            id="category"
            {...form.register("category", {
              // The subcategory belongs to the previous category, so it cannot survive the change.
              onChange: () => form.setValue("subcategory", ""),
            })}
          >
            <option value="">Select a category</option>
            {productCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          {!errors.category ? (
            <p className="mt-1 text-muted-foreground text-xs" id="category-help">
              Hardgoods are skate parts, Softgoods are clothing and wearables, and Accessories are
              minor items such as stickers, patches, keychains, and buttons.
            </p>
          ) : null}
        </FormField>

        <FormField error={errors.subcategory?.message} id="subcategory" label="Subcategory">
          <select
            aria-describedby={errors.subcategory ? "subcategory-error" : "subcategory-help"}
            aria-invalid={Boolean(errors.subcategory)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={subcategoryOptions.length === 0}
            id="subcategory"
            {...form.register("subcategory")}
          >
            <option value="">
              {subcategoryOptions.length === 0 ? "Select a category first" : "Select a subcategory"}
            </option>
            {subcategoryOptions.map((subcategory) => (
              <option key={subcategory.value} value={subcategory.value}>
                {subcategory.label}
              </option>
            ))}
          </select>
          {!errors.subcategory ? (
            <p className="mt-1 text-muted-foreground text-xs" id="subcategory-help">
              Changing the category clears the subcategory so the pair always matches.
            </p>
          ) : null}
        </FormField>

        <FormField error={errors.status?.message} id="status" label="Status">
          <select
            aria-describedby={errors.status ? "status-error" : undefined}
            aria-invalid={Boolean(errors.status)}
            className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            id="status"
            {...form.register("status")}
          >
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="archived">Archived</option>
          </select>
        </FormField>
      </div>

      <FormField error={errors.description?.message} id="description" label="Description">
        <textarea
          aria-describedby={errors.description ? "description-error" : undefined}
          aria-invalid={Boolean(errors.description)}
          className="min-h-36 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          id="description"
          {...form.register("description")}
        />
      </FormField>

      {actionError ? (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}
      {successMessage ? (
        <p className="text-sm" role="status">
          {successMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-6">
        <div>
          {productId && selectedStatus !== "archived" ? (
            <div>
              <Button
                disabled={isArchiving || form.formState.isSubmitting || form.formState.isDirty}
                onClick={onArchive}
                type="button"
                variant="destructive"
              >
                {isArchiving ? "Archiving…" : "Archive product"}
              </Button>
              {form.formState.isDirty ? (
                <p className="mt-2 text-muted-foreground text-xs">
                  Save your changes before archiving.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="flex gap-3">
          <Button asChild variant="outline">
            <Link href={"/admin/products" as Route} prefetch={false}>
              Cancel
            </Link>
          </Button>
          <Button disabled={form.formState.isSubmitting || isArchiving} type="submit">
            {form.formState.isSubmitting
              ? "Saving…"
              : productId
                ? "Save product"
                : "Create product"}
          </Button>
        </div>
      </div>
    </form>
  );
}

function FormField({
  children,
  error,
  id,
  label,
}: {
  children: React.ReactNode;
  error?: string;
  id: string;
  label: string;
}) {
  return (
    <div>
      <label className="mb-2 block font-semibold text-sm" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-destructive text-xs" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
