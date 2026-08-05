export type VariantMoveDirection = "up" | "down";

/**
 * Returns the variant list with the given variant moved one step, or null when
 * the move is a no-op (variant missing, or already at the edge). Pure so the
 * reordering rules are unit-testable apart from the database transaction.
 */
export function moveVariantInList<T extends { id: string }>(
  variants: readonly T[],
  variantId: string,
  direction: VariantMoveDirection,
): T[] | null {
  const fromIndex = variants.findIndex((variant) => variant.id === variantId);

  if (fromIndex === -1) {
    return null;
  }

  const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;

  if (toIndex < 0 || toIndex >= variants.length) {
    return null;
  }

  const reordered = [...variants];
  const [moved] = reordered.splice(fromIndex, 1);
  reordered.splice(toIndex, 0, moved);

  return reordered;
}
