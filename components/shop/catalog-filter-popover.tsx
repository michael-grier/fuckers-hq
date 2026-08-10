"use client";

import { ListFilter } from "lucide-react";
import { useState } from "react";

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
  scopedCategory: ProductCategory | null;
};

export function CatalogFilterPopover({
  appliedCategories,
  appliedSubcategories,
  isPending,
  onApply,
  scopedCategory,
}: CatalogFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [staged, setStaged] = useState<StagedCatalogFilters>({
    categories: [],
    subcategories: [],
  });

  // The locked view scope never counts toward the active-selection total.
  const activeCount = appliedCategories.length + appliedSubcategories.length;

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
      >
        {scopedCategory ? (
          <SubcategoryFieldset
            category={scopedCategory}
            legend="Subcategories"
            onToggle={(subcategory, checked) =>
              setStaged((current) => toggleStagedSubcategory(current, subcategory, checked))
            }
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
                  category={category.value}
                  key={category.value}
                  legend={`${category.label} subcategories`}
                  onToggle={(subcategory, checked) =>
                    setStaged((current) => toggleStagedSubcategory(current, subcategory, checked))
                  }
                  stagedSubcategories={staged.subcategories}
                />
              ))}
          </>
        )}
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

function SubcategoryFieldset({
  category,
  legend,
  onToggle,
  stagedSubcategories,
}: {
  category: ProductCategory;
  legend: string;
  onToggle: (subcategory: ProductSubcategory, checked: boolean) => void;
  stagedSubcategories: ProductSubcategory[];
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 font-semibold text-sm">{legend}</legend>
      {getProductSubcategoryOptions(category).map((subcategory) => (
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
