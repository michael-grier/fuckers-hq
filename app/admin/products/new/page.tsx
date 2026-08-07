import type { Route } from "next";
import Link from "next/link";

import { ProductComposer } from "@/components/admin/product-composer";
import { Button } from "@/components/ui/button";
import { isR2Configured } from "@/lib/r2";

export default function NewAdminProductPage() {
  // Generated per visit so images can upload to R2 under the final product id
  // before the product row exists; createProductFromComposer claims it.
  const draftProductId = crypto.randomUUID();

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild className="-ml-3" size="sm" variant="ghost">
          <Link href={"/admin/products" as Route} prefetch={false}>
            ← Back to products
          </Link>
        </Button>
        <div>
          <h1 className="font-grotesk font-semibold text-4xl tracking-tight">New product</h1>
          <p className="mt-2 text-muted-foreground">
            Everything on one page — publish immediately, or save a draft at any point.
          </p>
        </div>
      </div>

      <ProductComposer productId={draftProductId} r2Configured={isR2Configured()} />
    </div>
  );
}
