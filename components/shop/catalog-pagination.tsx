import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { CatalogSearchParams } from "@/lib/catalog/search-params";

type CatalogPaginationProps = {
  currentPage: number;
  searchParams: Pick<
    CatalogSearchParams,
    "q" | "category" | "categories" | "subcategories" | "sort"
  >;
  totalPages: number;
};

function getPageHref(page: number, searchParams: CatalogPaginationProps["searchParams"]) {
  return {
    pathname: "/products",
    query: {
      q: searchParams.q,
      category: searchParams.category,
      // Arrays serialize as repeated parameters, preserving multi-select filters across pages.
      categories: searchParams.categories,
      subcategories: searchParams.subcategories,
      sort: searchParams.sort,
      page: String(page),
    },
  } as const;
}

export function CatalogPagination({
  currentPage,
  searchParams,
  totalPages,
}: CatalogPaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const page = Math.min(Math.max(currentPage, 1), totalPages);
  const hasPreviousPage = page > 1;
  const hasNextPage = page < totalPages;

  return (
    <nav className="flex items-center justify-center gap-3" aria-label="Catalog pagination">
      {hasPreviousPage ? (
        <Button asChild variant="outline">
          <Link
            aria-label={`Go to catalog page ${page - 1}`}
            href={getPageHref(page - 1, searchParams)}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Link>
        </Button>
      ) : (
        <Button aria-disabled="true" disabled type="button" variant="outline">
          <ChevronLeft aria-hidden="true" />
          Previous
        </Button>
      )}
      <p className="text-muted-foreground text-sm" aria-current="page">
        Page {page} of {totalPages}
      </p>
      {hasNextPage ? (
        <Button asChild variant="outline">
          <Link
            aria-label={`Go to catalog page ${page + 1}`}
            href={getPageHref(page + 1, searchParams)}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      ) : (
        <Button aria-disabled="true" disabled type="button" variant="outline">
          Next
          <ChevronRight aria-hidden="true" />
        </Button>
      )}
    </nav>
  );
}
