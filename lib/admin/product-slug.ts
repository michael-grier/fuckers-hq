/**
 * Suggests a URL slug from a product name, matching the server slug contract
 * (lowercase letters, numbers, single hyphens, max 120 chars). Returns an
 * empty string when the name has no usable characters; the admin then fills
 * the slug in by hand.
 */
export function suggestProductSlug(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      // Strip combining marks left by NFKD so accented letters fold to ASCII.
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120)
      .replace(/-+$/, "")
  );
}
