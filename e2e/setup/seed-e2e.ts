import { closeDb, getDb } from "@/lib/db/client";
import { products, productVariants } from "@/lib/db/schema";

/**
 * E2E-only fixtures the base seed does not cover, upserted with the same slug/SKU conflict
 * handling as lib/db/seed.ts so reruns reset them. The database may hold arbitrary other catalog
 * data (worktree Neon branches inherit the parent branch's rows), so every fixture name carries
 * the "E2E" token: specs filter the catalog with q=e2e to get a deterministic result set instead
 * of assuming the fixtures are the only products.
 */
const e2eProducts = [
  {
    slug: "e2e-sold-out-deck",
    name: "E2E Sold Out Deck",
    description: "Fixture product for automated tests. Intentionally out of stock.",
    category: "hardgoods",
    subcategory: "decks",
    shippingProfile: "deck" as const,
    status: "active" as const,
    variants: [{ name: '8.0"', sku: "E2E-DECK-SOLDOUT", priceCents: 9900, inventoryQty: 0 }],
  },
  {
    // Cheap in-stock counterpart, so price sorting over the q=e2e result set has a known order.
    slug: "e2e-budget-bearings",
    name: "E2E Budget Bearings",
    description: "Fixture product for automated tests. In stock and inexpensive.",
    category: "hardgoods",
    subcategory: "bearings",
    shippingProfile: "softgood" as const,
    status: "active" as const,
    variants: [
      { name: "Set of 8", sku: "E2E-BEARINGS-BUDGET", priceCents: 500, inventoryQty: 8 },
      { name: "Ceramic", sku: "E2E-BEARINGS-CERAMIC", priceCents: 700, inventoryQty: 0 },
    ],
  },
];

const db = getDb();

try {
  // One transaction so an interrupted run cannot leave a fixture product without its variants.
  await db.transaction(async (tx) => {
    for (const product of e2eProducts) {
      const [savedProduct] = await tx
        .insert(products)
        .values({
          slug: product.slug,
          name: product.name,
          description: product.description,
          category: product.category,
          subcategory: product.subcategory,
          shippingProfile: product.shippingProfile,
          status: product.status,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: products.slug,
          set: {
            name: product.name,
            description: product.description,
            category: product.category,
            subcategory: product.subcategory,
            shippingProfile: product.shippingProfile,
            status: product.status,
            updatedAt: new Date(),
          },
        })
        .returning();

      for (const variant of product.variants) {
        await tx
          .insert(productVariants)
          .values({
            productId: savedProduct.id,
            name: variant.name,
            sku: variant.sku,
            priceCents: variant.priceCents,
            inventoryQty: variant.inventoryQty,
          })
          .onConflictDoUpdate({
            target: productVariants.sku,
            set: {
              productId: savedProduct.id,
              name: variant.name,
              priceCents: variant.priceCents,
              inventoryQty: variant.inventoryQty,
            },
          });
      }
    }
  });

  console.log(`Seeded ${e2eProducts.length} e2e fixture products.`);
} finally {
  await closeDb();
}
