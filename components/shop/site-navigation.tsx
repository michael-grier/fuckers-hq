import type { Route } from "next";
import Link from "next/link";

export function DesktopNavigation() {
  return (
    <nav
      aria-label="Primary navigation"
      className="hidden items-center gap-7 font-semibold text-sm md:flex"
    >
      <Link className="text-white/80 transition hover:text-white" href="/products">
        Shop
      </Link>
      <Link className="text-white/80 transition hover:text-white" href={"/crew" as Route}>
        Crew
      </Link>
      <Link className="text-white/80 transition hover:text-white" href={"/videos" as Route}>
        Videos
      </Link>
    </nav>
  );
}
