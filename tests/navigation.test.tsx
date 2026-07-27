import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import CrewPage from "@/app/(shop)/crew/page";
import VideosPage from "@/app/(shop)/videos/page";
import { DesktopNavigation } from "@/components/shop/site-navigation";

describe("storefront navigation", () => {
  test("links to the catalog, crew, and videos destinations", () => {
    const markup = renderToStaticMarkup(<DesktopNavigation />);

    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain('href="/products">Shop</a>');
    expect(markup).toContain('href="/crew">Crew</a>');
    expect(markup).toContain('href="/videos">Videos</a>');
    expect(markup).not.toContain(">Decks</a>");
    expect(markup).not.toContain(">Apparel</a>");
  });

  test("renders branded placeholders for both new destinations", () => {
    const crewMarkup = renderToStaticMarkup(<CrewPage />);
    const videosMarkup = renderToStaticMarkup(<VideosPage />);

    expect(crewMarkup).toContain("<h1");
    expect(crewMarkup).toContain("Meet the crew.");
    expect(crewMarkup).toContain("Crew profiles are on the way");
    expect(videosMarkup).toContain("<h1");
    expect(videosMarkup).toContain("Watch the latest.");
    expect(videosMarkup).toContain("The first edit is coming soon");
  });
});
