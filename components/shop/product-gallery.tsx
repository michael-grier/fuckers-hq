import Image from "next/image";

import type { CatalogImage } from "@/lib/catalog/queries";

type ProductGalleryProps = {
  name: string;
  images: CatalogImage[];
};

export function ProductGallery({ name, images }: ProductGalleryProps) {
  const primaryImage = images[0];
  const secondaryImages = images.slice(1, 4);

  return (
    <div className="space-y-3">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {primaryImage ? (
          <Image
            alt={primaryImage.alt ?? name}
            className="h-full w-full object-contain object-center"
            fill
            priority
            sizes="(min-width: 1024px) 55vw, 100vw"
            src={primaryImage.url}
            unoptimized
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center font-grotesk font-semibold text-4xl text-neutral-300">
            {name}
          </div>
        )}
      </div>
      {secondaryImages.length > 0 ? (
        <div className="grid grid-cols-3 gap-3">
          {secondaryImages.map((image) => (
            <div
              className="relative aspect-square overflow-hidden rounded-md bg-muted"
              key={image.id}
            >
              <Image
                alt={image.alt ?? name}
                className="h-full w-full object-contain object-center"
                fill
                sizes="20vw"
                src={image.url}
                unoptimized
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
