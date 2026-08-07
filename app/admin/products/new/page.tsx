import type { Route } from "next";
import Link from "next/link";

import { ProductForm } from "@/components/admin/product-form";
import { Button } from "@/components/ui/button";

export default function NewAdminProductPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Button asChild className="-ml-3" size="sm" variant="ghost">
          <Link href={"/admin/products" as Route} prefetch={false}>
            ← Back to products
          </Link>
        </Button>
        <div>
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">New product</h1>
          <p className="mt-2 text-muted-foreground">
            Start in draft while you add variants and product details.
          </p>
        </div>
      </div>

      <section className="rounded-lg border bg-background p-6">
        <ProductForm
          defaultValues={{
            name: "",
            slug: "",
            description: "",
            category: "",
            subcategory: "",
            status: "draft",
          }}
        />
      </section>
    </div>
  );
}
