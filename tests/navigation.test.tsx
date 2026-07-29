import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import CrewPage from "@/app/(shop)/crew/page";
import VideosPage from "@/app/(shop)/videos/page";
import {
  DesktopNavigation,
  MobileNavigation,
  shopNavigationLinks,
} from "@/components/shop/site-navigation";

describe("storefront navigation", () => {
  test("renders the desktop Shop flyout and primary destinations", () => {
    const markup = renderToStaticMarkup(<DesktopNavigation />);

    expect(markup).toContain('aria-label="Primary navigation"');
    expect(markup).toContain("group-hover:visible");
    expect(markup).toContain("group-focus-within:visible");
    expect(markup).toContain('aria-label="Shop categories"');
    expect(markup).toContain('href="/crew">Crew</a>');
    expect(markup).toContain('href="/videos">Videos</a>');
    expect(shopNavigationLinks.map((link) => link.label)).toEqual([
      "Shop All",
      "Hardgoods",
      "Softgoods",
      "Accessories",
    ]);
    expect(markup).toContain('href="/products?category=hardgoods"');
    expect(markup).toContain('href="/products?category=softgoods"');
    expect(markup).toContain('href="/products?category=accessories"');
  });

  test("renders a controlled mobile Shop disclosure with the same destinations", () => {
    const closedMarkup = renderToStaticMarkup(
      <MobileNavigation
        isOpen={false}
        isShopOpen={false}
        onClose={() => undefined}
        onShopToggle={() => undefined}
      />,
    );
    const openMarkup = renderToStaticMarkup(
      <MobileNavigation
        isOpen
        isShopOpen
        onClose={() => undefined}
        onShopToggle={() => undefined}
      />,
    );

    expect(closedMarkup).toContain('aria-label="Mobile navigation"');
    expect(closedMarkup).toContain('hidden="" id="mobile-navigation"');
    expect(closedMarkup).toContain('aria-controls="mobile-shop-links"');
    expect(closedMarkup).toContain('aria-expanded="false"');
    expect(openMarkup).toContain('aria-expanded="true"');
    expect(openMarkup).toContain('id="mobile-shop-links"');
    expect(openMarkup).not.toContain('hidden="" id="mobile-shop-links"');
    expect(openMarkup).toContain('href="/products">Shop All</a>');
    expect(openMarkup).toContain('href="/products?category=hardgoods">Hardgoods</a>');
    expect(openMarkup).toContain('href="/products?category=softgoods">Softgoods</a>');
    expect(openMarkup).toContain('href="/products?category=accessories">Accessories</a>');
    expect(openMarkup).toContain('href="/crew">Crew</a>');
    expect(openMarkup).toContain('href="/videos">Videos</a>');
  });

  test("renders branded placeholders for both new destinations", () => {
    const crewMarkup = renderToStaticMarkup(<CrewPage />);
    const videosMarkup = renderToStaticMarkup(<VideosPage />);

    expect(crewMarkup).toContain("<h1");
    expect(crewMarkup).toContain("Meet the crew.");
    expect(crewMarkup).toContain("Crew profiles are on the way");
    expect(videosMarkup).toContain("<h1");
    expect(videosMarkup).toContain("Watch the latest.");
    expect(videosMarkup).toContain("We&#x27;re working on it okay?");
  });
});
