"use client";

import { ListFilter } from "lucide-react";
import { type KeyboardEvent as ReactKeyboardEvent, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  getProductSubcategoryOptions,
  type ProductCategory,
  type ProductSubcategory,
  productCategories,
} from "@/lib/catalog/categories";
import {
  type CatalogFilterUpdate,
  type StagedCatalogFilters,
  toCatalogFilterUpdate,
  toggleStagedCategory,
  toggleStagedSubcategory,
} from "@/lib/catalog/filter-staging";

type CatalogFilterPopoverProps = {
  appliedCategories: ProductCategory[];
  appliedSubcategories: ProductSubcategory[];
  isPending: boolean;
  onApply: (update: CatalogFilterUpdate) => Promise<void>;
  populatedSubcategories: ProductSubcategory[];
  scopedCategory: ProductCategory | null;
};

/**
 * The subcategory checkboxes to show under a category: the ones the catalogue has products in,
 * plus any already applied. An applied filter stays listed even once its last product is gone,
 * so it can be unchecked here rather than only through Clear.
 */
function visibleSubcategoryOptions(
  category: ProductCategory,
  populatedSubcategories: ProductSubcategory[],
  appliedSubcategories: ProductSubcategory[],
) {
  return getProductSubcategoryOptions(category).filter(
    ({ value }) => populatedSubcategories.includes(value) || appliedSubcategories.includes(value),
  );
}

export function CatalogFilterPopover({
  appliedCategories,
  appliedSubcategories,
  isPending,
  onApply,
  populatedSubcategories,
  scopedCategory,
}: CatalogFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<StagedCatalogFilters>({
    categories: [],
    subcategories: [],
  });

  // The locked view scope never counts toward the active-selection total.
  const activeCount = appliedCategories.length + appliedSubcategories.length;

  // A scoped view offers subcategories only; if the scope holds no products, there is nothing
  // to check and the panel says so instead of showing a bare row of buttons.
  const scopedSubcategoryOptions = scopedCategory
    ? visibleSubcategoryOptions(scopedCategory, populatedSubcategories, appliedSubcategories)
    : [];

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      // Stage from the applied URL state; Cancel, Escape, or outside dismissal simply drops
      // this local copy, and the next open re-stages from the URL again.
      setStaged({ categories: appliedCategories, subcategories: appliedSubcategories });
    }

    setOpen(nextOpen);
  }

  async function apply(update: CatalogFilterUpdate) {
    setOpen(false);
    await onApply(update);
  }

  /**
   * Moves focus down and up the panel's controls, and swallows the key either way so the page
   * behind the open popover never scrolls instead.
   *
   * Queried on each keypress rather than cached, because checking a category adds that parent's
   * subcategory fieldset to the panel.
   */
  function handleContentKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }

    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    ];

    if (items.length === 0) {
      return;
    }

    event.preventDefault();

    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const forward = event.key === "ArrowDown";

    if (current === -1) {
      items[forward ? 0 : items.length - 1].focus();
      return;
    }

    items[(current + (forward ? 1 : -1) + items.length) % items.length].focus();
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <ListFilter aria-hidden="true" />
          Filters
          {activeCount > 0 ? (
            <Badge variant="secondary">
              {activeCount}
              <span className="sr-only"> active filters</span>
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        // Radix renders the content as role="dialog"; without this it is announced unnamed,
        // because the fieldset legends name only the groups inside it.
        aria-label="Filters"
        className="flex max-h-[min(26rem,var(--radix-popover-content-available-height))] w-[min(20rem,calc(100vw-2rem))] flex-col gap-4 overflow-y-auto"
        onKeyDown={handleContentKeyDown}
      >
        {scopedCategory ? (
          <SubcategoryFieldset
            legend="Subcategories"
            onToggle={(subcategory, checked) =>
              setStaged((current) => toggleStagedSubcategory(current, subcategory, checked))
            }
            options={scopedSubcategoryOptions}
            stagedSubcategories={staged.subcategories}
          />
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="mb-2 font-semibold text-sm">Categories</legend>
              {productCategories.map((category) => (
                <FilterCheckbox
                  checked={staged.categories.includes(category.value)}
                  id={`catalog-filter-category-${category.value}`}
                  key={category.value}
                  label={category.label}
                  onCheckedChange={(checked) =>
                    setStaged((current) => toggleStagedCategory(current, category.value, checked))
                  }
                />
              ))}
            </fieldset>
            {productCategories
              .filter((category) => staged.categories.includes(category.value))
              .map((category) => (
                <SubcategoryFieldset
                  key={category.value}
                  legend={`${category.label} subcategories`}
                  onToggle={(subcategory, checked) =>
                    setStaged((current) => toggleStagedSubcategory(current, subcategory, checked))
                  }
                  options={visibleSubcategoryOptions(
                    category.value,
                    populatedSubcategories,
                    appliedSubcategories,
                  )}
                  stagedSubcategories={staged.subcategories}
                />
              ))}
          </>
        )}
        {scopedCategory && scopedSubcategoryOptions.length === 0 ? (
          <p className="text-muted-foreground text-sm">No filters available for this category.</p>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <Button
            disabled={isPending}
            onClick={() => apply({ categories: null, subcategories: null })}
            size="sm"
            type="button"
            variant="ghost"
          >
            Clear
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => setOpen(false)} size="sm" type="button" variant="outline">
              Cancel
            </Button>
            <Button
              disabled={isPending}
              onClick={() => apply(toCatalogFilterUpdate(staged, scopedCategory))}
              size="sm"
              type="button"
            >
              Apply
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// Renders nothing when the category has no offerable subcategories, so the panel never shows a
// heading with no checkboxes under it.
function SubcategoryFieldset({
  legend,
  onToggle,
  options,
  stagedSubcategories,
}: {
  legend: string;
  onToggle: (subcategory: ProductSubcategory, checked: boolean) => void;
  options: ReadonlyArray<{ label: string; value: ProductSubcategory }>;
  stagedSubcategories: ProductSubcategory[];
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold text-sm">{legend}</legend>
      {options.map((subcategory) => (
        <FilterCheckbox
          checked={stagedSubcategories.includes(subcategory.value)}
          id={`catalog-filter-subcategory-${subcategory.value}`}
          key={subcategory.value}
          label={subcategory.label}
          onCheckedChange={(checked) => onToggle(subcategory.value, checked)}
        />
      ))}
    </fieldset>
  );
}

function FilterCheckbox({
  checked,
  id,
  label,
  onCheckedChange,
}: {
  checked: boolean;
  id: string;
  label: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        checked={checked}
        id={id}
        onCheckedChange={(state) => onCheckedChange(state === true)}
      />
      <label className="text-sm" htmlFor={id}>
        {label}
      </label>
    </div>
  );
}
