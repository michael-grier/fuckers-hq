"use client";

import { Search } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getProductCategoryLabel,
  type ProductCategory,
  productCategoryValues,
} from "@/lib/catalog/categories";
import { type CatalogSort, catalogSortValues } from "@/lib/catalog/search-params";

const catalogSortParserValues = [...catalogSortValues];
const catalogCategoryParserValues = [...productCategoryValues];

type CatalogFiltersProps = {
  categories: ProductCategory[];
  totalProducts: number;
};

export function CatalogFilters({ categories, totalProducts }: CatalogFiltersProps) {
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useQueryState(
    "q",
    parseAsString.withDefault("").withOptions({ startTransition }),
  );
  const [category, setCategory] = useQueryState(
    "category",
    parseAsStringEnum<ProductCategory>(catalogCategoryParserValues).withOptions({
      startTransition,
    }),
  );
  const [sort, setSort] = useQueryState(
    "sort",
    parseAsStringEnum<CatalogSort>(catalogSortParserValues)
      .withDefault("newest")
      .withOptions({ startTransition }),
  );
  const [, setPage] = useQueryState(
    "page",
    parseAsInteger.withDefault(1).withOptions({ startTransition }),
  );

  async function resetPage() {
    await setPage(1);
  }

  return (
    <section className="space-y-4 border-b pb-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative block w-full lg:max-w-md">
          <label className="sr-only" htmlFor="catalog-search">
            Search products
          </label>
          <Search
            aria-hidden="true"
            className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="pl-9"
            id="catalog-search"
            onChange={async (event) => {
              await setQuery(event.target.value);
              await resetPage();
            }}
            placeholder="Search"
            value={query}
          />
        </div>
        <div className="flex items-center gap-3">
          <p className="min-w-24 text-muted-foreground text-sm" aria-live="polite">
            {isPending ? "Updating" : `${totalProducts} items`}
          </p>
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Sort</span>
            <select
              className="h-10 rounded-md border border-input bg-background px-3 font-medium outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onChange={async (event) => {
                await setSort(event.target.value as CatalogSort);
                await resetPage();
              }}
              value={sort}
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price ascending</option>
              <option value="price-desc">Price descending</option>
              <option value="name-asc">Name ascending</option>
            </select>
          </label>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            await setCategory(null);
            await resetPage();
          }}
          size="sm"
          type="button"
          variant={category ? "outline" : "default"}
        >
          All
        </Button>
        {categories.map((item) => (
          <Button
            key={item}
            onClick={async () => {
              await setCategory(item);
              await resetPage();
            }}
            size="sm"
            type="button"
            variant={category === item ? "default" : "outline"}
          >
            {getProductCategoryLabel(item)}
          </Button>
        ))}
      </div>
    </section>
  );
}
