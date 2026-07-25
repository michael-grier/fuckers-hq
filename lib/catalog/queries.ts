import "server-only";

import { asc } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { env } from "@/lib/env";

import type { CatalogSearchParams, CatalogSort } from "./search-params";

export type CatalogVariant = {
  id: string;
  name: string;
  sku: string;
  priceCents: number;
  inventoryQty: number;
  reservedQty: number;
  availableQty: number;
};

export type CatalogImage = {
  id: string;
  url: string;
  alt: string | null;
  position: number;
};

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  createdAt: Date;
  updatedAt: Date;
  variants: CatalogVariant[];
  images: CatalogImage[];
  minPriceCents: number | null;
  maxPriceCents: number | null;
  totalInventoryQty: number;
};

export type CatalogPageResult = {
  products: CatalogProduct[];
  categories: string[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalProducts: number;
};

const PAGE_SIZE = 12;

function canQueryDatabase(): boolean {
  return Boolean(env.DATABASE_URL);
}

function toCatalogProduct(
  row: Awaited<ReturnType<typeof fetchActiveProducts>>[number],
): CatalogProduct {
  const prices = row.variants.map((variant) => variant.priceCents);

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variants: row.variants.map((variant) => ({
      ...variant,
      availableQty: variant.inventoryQty - variant.reservedQty,
    })),
    images: row.images.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    minPriceCents: prices.length > 0 ? Math.min(...prices) : null,
    maxPriceCents: prices.length > 0 ? Math.max(...prices) : null,
    totalInventoryQty: row.variants.reduce(
      (total, variant) => total + variant.inventoryQty - variant.reservedQty,
      0,
    ),
  };
}

function sortProducts(products: CatalogProduct[], sort: CatalogSort): CatalogProduct[] {
  return [...products].sort((a, b) => {
    switch (sort) {
      case "price-asc":
        return (
          (a.minPriceCents ?? Number.MAX_SAFE_INTEGER) -
          (b.minPriceCents ?? Number.MAX_SAFE_INTEGER)
        );
      case "price-desc":
        return (b.minPriceCents ?? 0) - (a.minPriceCents ?? 0);
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "newest":
        return b.createdAt.getTime() - a.createdAt.getTime();
      default:
        return 0;
    }
  });
}

async function fetchActiveProducts() {
  const db = getDb();

  return db.query.products.findMany({
    where: (products, { eq }) => eq(products.status, "active"),
    with: {
      variants: true,
      images: {
        orderBy: (images) => [asc(images.position), asc(images.id)],
      },
    },
    orderBy: (products, { desc }) => [desc(products.createdAt)],
  });
}

export async function getCatalogPage(params: CatalogSearchParams): Promise<CatalogPageResult> {
  if (!canQueryDatabase()) {
    return {
      products: [],
      categories: [],
      page: 1,
      pageSize: PAGE_SIZE,
      totalPages: 1,
      totalProducts: 0,
    };
  }

  const query = params.q.trim().toLowerCase();
  const category = params.category.trim().toLowerCase();
  const activeProducts = (await fetchActiveProducts()).map(toCatalogProduct);
  const categories = Array.from(
    new Set(
      activeProducts
        .map((product) => product.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ).sort();

  const filtered = activeProducts.filter((product) => {
    const categoryMatches = !category || product.category?.toLowerCase() === category;
    const queryMatches =
      !query ||
      product.name.toLowerCase().includes(query) ||
      product.description?.toLowerCase().includes(query) ||
      product.variants.some((variant) => variant.name.toLowerCase().includes(query));

    return categoryMatches && queryMatches;
  });

  const sorted = sortProducts(filtered, params.sort);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(Math.max(params.page, 1), totalPages);
  const start = (page - 1) * PAGE_SIZE;

  return {
    products: sorted.slice(start, start + PAGE_SIZE),
    categories,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    totalProducts: sorted.length,
  };
}

export async function getFeaturedProducts(limit = 3): Promise<CatalogProduct[]> {
  if (!canQueryDatabase()) {
    return [];
  }

  const products = (await fetchActiveProducts()).map(toCatalogProduct);

  return sortProducts(products, "newest").slice(0, limit);
}

export async function getProductBySlug(slug: string): Promise<CatalogProduct | null> {
  if (!canQueryDatabase()) {
    return null;
  }

  const db = getDb();
  const product = await db.query.products.findFirst({
    where: (products, { and, eq }) => and(eq(products.slug, slug), eq(products.status, "active")),
    with: {
      variants: true,
      images: {
        orderBy: (images) => [asc(images.position), asc(images.id)],
      },
    },
  });

  return product ? toCatalogProduct(product) : null;
}
