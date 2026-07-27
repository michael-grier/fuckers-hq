"use client";

import { Search } from "lucide-react";
import { parseAsInteger, parseAsString, parseAsStringEnum, useQueryStates } from "nuqs";
import { useTransition } from "react";

import { Input } from "@/components/ui/input";
import {
  type CatalogSort,
  catalogFilterUrlOptions,
  catalogSortValues,
  withFirstCatalogPage,
} from "@/lib/catalog/search-params";

const catalogSortParserValues = [...catalogSortValues];

type CatalogFiltersProps = {
  totalProducts: number;
};

export function CatalogFilters({ totalProducts }: CatalogFiltersProps) {
  const [isPending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      sort: parseAsStringEnum<CatalogSort>(catalogSortParserValues).withDefault("newest"),
      page: parseAsInteger.withDefault(1),
    },
    {
      ...catalogFilterUrlOptions,
      startTransition,
    },
  );

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
              await setFilters(withFirstCatalogPage({ q: event.target.value }));
            }}
            placeholder="Search"
            value={filters.q}
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
                await setFilters(withFirstCatalogPage({ sort: event.target.value as CatalogSort }));
              }}
              value={filters.sort}
            >
              <option value="newest">Newest</option>
              <option value="price-asc">Price ascending</option>
              <option value="price-desc">Price descending</option>
              <option value="name-asc">Name ascending</option>
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}
