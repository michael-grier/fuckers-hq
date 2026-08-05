"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { ReorderableList } from "@/components/admin/reorderable-list";
import { type ExistingVariant, VariantForm } from "@/components/admin/variant-form";
import { moveVariant } from "@/lib/actions/variants";
import { moveVariantInList, type VariantMoveDirection } from "@/lib/admin/variant-order";

type VariantListProps = {
  productId: string;
  productStatus: "draft" | "active" | "archived";
  variants: ExistingVariant[];
};

/**
 * Owns the variant display order so a reorder renders immediately instead of
 * waiting for the server round-trip. The optimistic order is derived with the
 * same helper the server action uses, and is replaced by the revalidated
 * server order once the action settles.
 */
export function VariantList({ productId, productStatus, variants }: VariantListProps) {
  const router = useRouter();
  const [moveError, setMoveError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticVariants, applyOptimisticMove] = useOptimistic(
    variants,
    (current: ExistingVariant[], move: { variantId: string; direction: VariantMoveDirection }) =>
      moveVariantInList(current, move.variantId, move.direction) ?? current,
  );

  function handleMove(variantId: string, direction: VariantMoveDirection) {
    setMoveError(null);

    startTransition(async () => {
      applyOptimisticMove({ variantId, direction });

      const result = await moveVariant({ productId, variantId, direction });

      if (!result.success) {
        // React drops the optimistic order when the transition ends, so the
        // list snaps back to the server order on failure.
        setMoveError(result.message);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {moveError ? (
        <p className="text-destructive text-sm" role="alert">
          {moveError}
        </p>
      ) : null}
      <ReorderableList className="space-y-4">
        {optimisticVariants.map((variant, index) => (
          <VariantForm
            canMoveDown={index < optimisticVariants.length - 1}
            canMoveUp={index > 0}
            key={variant.id}
            onMove={(direction) => handleMove(variant.id, direction)}
            productId={productId}
            productStatus={productStatus}
            variant={variant}
          />
        ))}
      </ReorderableList>
    </div>
  );
}
