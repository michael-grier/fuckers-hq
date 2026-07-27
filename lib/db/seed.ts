import { eq } from "drizzle-orm";

import { closeDb, getDb } from "@/lib/db/client";
import { productImages, products, productVariants } from "@/lib/db/schema";

const seedProducts = [
  {
    slug: "street-deck-825",
    name: "Street Deck 8.25",
    description: "A balanced popsicle deck for street sessions and everyday park skating.",
    category: "hardgoods",
    status: "active" as const,
    image: {
      url: "https://placehold.co/1200x1200/f4f4f5/18181b/png?text=Street+Deck",
      alt: "Street Deck 8.25 skateboard deck",
    },
    variants: [
      { name: '8.25"', sku: "DECK-STREET-825", priceCents: 8900, inventoryQty: 12 },
      { name: '8.5"', sku: "DECK-STREET-850", priceCents: 9200, inventoryQty: 8 },
    ],
  },
  {
    slug: "canvas-coach-jacket",
    name: "Canvas Coach Jacket",
    description: "A midweight coach jacket with snap closure and a relaxed skate fit.",
    category: "softgoods",
    status: "active" as const,
    image: {
      url: "https://placehold.co/1200x1200/e7e5e4/18181b/png?text=Coach+Jacket",
      alt: "Canvas coach jacket",
    },
    variants: [
      { name: "Medium", sku: "JACKET-CANVAS-M", priceCents: 12800, inventoryQty: 5 },
      { name: "Large", sku: "JACKET-CANVAS-L", priceCents: 12800, inventoryQty: 6 },
      { name: "XL", sku: "JACKET-CANVAS-XL", priceCents: 12800, inventoryQty: 3 },
    ],
  },
  {
    slug: "precision-bearings",
    name: "Precision Bearings",
    description: "Fast, durable bearings for clean roll speed and easy maintenance.",
    category: "hardgoods",
    status: "active" as const,
    image: {
      url: "https://placehold.co/1200x1200/fafafa/18181b/png?text=Bearings",
      alt: "Set of skateboard bearings",
    },
    variants: [
      { name: "Set of 8", sku: "BEARINGS-PRECISION-8", priceCents: 3400, inventoryQty: 24 },
    ],
  },
];

const db = getDb();

try {
  for (const product of seedProducts) {
    const [savedProduct] = await db
      .insert(products)
      .values({
        slug: product.slug,
        name: product.name,
        description: product.description,
        category: product.category,
        status: product.status,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: products.slug,
        set: {
          name: product.name,
          description: product.description,
          category: product.category,
          status: product.status,
          updatedAt: new Date(),
        },
      })
      .returning();

    for (const variant of product.variants) {
      await db
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

    await db.delete(productImages).where(eq(productImages.productId, savedProduct.id));
    await db.insert(productImages).values({
      productId: savedProduct.id,
      url: product.image.url,
      alt: product.image.alt,
      position: 0,
    });
  }

  console.log(`Seeded ${seedProducts.length} products.`);
} finally {
  await closeDb();
}
