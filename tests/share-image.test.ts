import { describe, expect, test } from "bun:test";

/**
 * Guards the site-wide share image against a bad artwork swap. External scrapers are strict
 * about this asset in ways nothing else in the build checks: several do not handle WebP, large
 * files time out during scraping, and platforms expect the 1.91:1 (1200 × 630) card size. See
 * issue #68 for the full specification.
 */
describe("site-wide Open Graph share image", () => {
  const imagePath = new URL("../app/opengraph-image.png", import.meta.url);

  test("is a 1200 × 630 PNG under 1 MB", async () => {
    const file = Bun.file(imagePath);
    expect(await file.exists()).toBe(true);
    expect(file.size).toBeLessThan(1024 * 1024);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    expect(Array.from(bytes.subarray(0, 8))).toEqual(pngSignature);

    // PNG stores dimensions as big-endian u32s at fixed offsets in the IHDR chunk.
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(16)).toBe(1200);
    expect(view.getUint32(20)).toBe(630);
  });

  test("has alt text for the file-convention metadata route", async () => {
    const altFile = Bun.file(new URL("../app/opengraph-image.alt.txt", import.meta.url));
    expect(await altFile.exists()).toBe(true);
    expect((await altFile.text()).trim().length).toBeGreaterThan(0);
  });
});
