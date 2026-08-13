"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import type { CatalogImage } from "@/lib/catalog/queries";
import { cn } from "@/lib/utils";

type ProductGalleryProps = {
  name: string;
  images: CatalogImage[];
};

/**
 * Product-page image display. Products with one (or zero) images get a plain
 * stage with no carousel chrome; two or more images get a swipeable carousel
 * with arrows, a position counter, and dot navigation (issue #61).
 */
export function ProductGallery({ name, images }: ProductGalleryProps) {
  if (images.length > 1) {
    return <ProductCarousel images={images} name={name} />;
  }

  const image = images[0];

  return (
    // 4:5 matches how product photos are shot (Instagram/iPhone portrait), and cover
    // fills the stage edge-to-edge so no letterbox gutters appear around the photo.
    // Below lg the layout is single-column and a full-width 4:5 stage would swallow
    // the viewport, so cap the width at what a 55svh-tall stage allows (height follows
    // via the aspect ratio) and center it, keeping product details near the fold.
    <div className="relative mx-auto aspect-[4/5] w-full max-w-[calc(55svh*4/5)] overflow-hidden rounded-lg bg-muted lg:max-w-none">
      {image ? (
        <Image
          alt={image.alt ?? name}
          className="h-full w-full object-cover object-center"
          fill
          priority
          sizes="(min-width: 1024px) 55vw, 100vw"
          src={image.url}
          unoptimized
        />
      ) : (
        <div className="flex h-full items-center justify-center px-6 text-center font-grotesk font-semibold text-4xl text-neutral-300">
          {name}
        </div>
      )}
    </div>
  );
}

function ProductCarousel({ name, images }: ProductGalleryProps) {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);

  // Embla owns slide position (swipe, drag, arrows); mirror it into state so
  // the counter and dots stay in sync however the user navigates.
  useEffect(() => {
    if (!api) {
      return;
    }
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect);
    return () => {
      api.off("select", onSelect);
    };
  }, [api]);

  return (
    <div className="space-y-3">
      {/* loop keeps prev/next always enabled; a disabled arrow would otherwise stay
          half-visible at the ends via the Button's disabled:opacity-50. */}
      {/* Width cap mirrors the single-image branch (see comment there); applying it
          here keeps the arrows, counter, and dots aligned with the shrunken stage. */}
      <Carousel
        aria-label={`${name} images`}
        className="group mx-auto w-full max-w-[calc(55svh*4/5)] overflow-hidden rounded-lg lg:max-w-none"
        opts={{ loop: true }}
        setApi={setApi}
      >
        {/* Cancel the gutter the shadcn primitive adds between slides: adjacent
            product photos touching edge-to-edge reads as one filmstrip. */}
        <CarouselContent className="ml-0">
          {images.map((image, index) => (
            <CarouselItem className="pl-0" key={image.id}>
              <div className="relative aspect-[4/5] bg-muted">
                <Image
                  alt={image.alt ?? name}
                  className="h-full w-full object-cover object-center"
                  fill
                  priority={index === 0}
                  sizes="(min-width: 1024px) 55vw, 100vw"
                  src={image.url}
                  unoptimized
                />
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 font-grotesk font-medium text-white text-xs">
          {current + 1} / {images.length}
        </span>
        {/* Arrows appear on hover/focus; touch users swipe instead. */}
        <CarouselPrevious className="left-3 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100" />
        <CarouselNext className="right-3 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100" />
      </Carousel>
      <div className="flex justify-center gap-2">
        {images.map((image, index) => (
          <button
            aria-label={`Go to image ${index + 1}`}
            className={cn(
              "h-2.5 rounded-full transition-all",
              index === current ? "w-6 bg-accent" : "w-2.5 bg-foreground/25 hover:bg-foreground/40",
            )}
            key={image.id}
            onClick={() => api?.scrollTo(index)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
