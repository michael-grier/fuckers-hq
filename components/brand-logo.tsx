import Image from "next/image";

import { cn } from "@/lib/utils";

// Intrinsic dimensions of public/logo.svg, passed so Next reserves layout space.
// Callers size the mark with a height utility; the width follows from `w-auto`.
const LOGO_WIDTH = 1886;
const LOGO_HEIGHT = 626;

type BrandLogoProps = {
  className?: string;
  /**
   * Pass "" when the logo sits inside a link or heading that already supplies the
   * brand name, so screen readers do not announce it twice.
   */
  alt?: string;
};

export function BrandLogo({ alt = "Fuckers Skateboards", className }: BrandLogoProps) {
  return (
    <Image
      alt={alt}
      className={cn("h-9 w-auto md:h-12", className)}
      height={LOGO_HEIGHT}
      priority
      src="/logo.svg"
      width={LOGO_WIDTH}
    />
  );
}
