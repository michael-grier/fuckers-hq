import { expect, test } from "@playwright/test";

// These specs prove the admin boundary from the outside, so they run in the admin project but
// with an empty session instead of the cached admin storageState.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("admin authorization @admin", () => {
  test("a signed-out visitor is sent to Clerk sign-in instead of /admin", async ({ page }) => {
    await page.goto("/admin");
    // The hosted sign-in host is derived from the publishable key, so only assert its shape.
    await expect(page).toHaveURL(/accounts\.dev\/sign-in/);
  });

  test("a signed-out request cannot mint an image upload URL", async ({ request }) => {
    // Without maxRedirects: 0 the client follows Clerk's redirect and reports the sign-in
    // page's 200, which is not what the endpoint answered.
    const response = await request.post("/api/admin/upload-url", {
      data: { fileName: "x.png", contentType: "image/png", fileSize: 100, productId: "p" },
      maxRedirects: 0,
    });
    expect(response.status()).toBeGreaterThanOrEqual(300);
    expect(await response.text()).not.toContain("uploadUrl");
  });
});
