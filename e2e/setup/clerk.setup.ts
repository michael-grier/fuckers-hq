import { clerk, clerkSetup } from "@clerk/testing/playwright";
import { expect, test as setup } from "@playwright/test";

// Token acquisition must complete before the sign-in below, so this file runs serially even
// though the suite is otherwise fully parallel.
setup.describe.configure({ mode: "serial" });

// Also referenced by the admin project's storageState in playwright.config.ts.
const ADMIN_STORAGE_STATE = "e2e/.clerk/admin.json";

setup("obtain a Clerk testing token", async () => {
  await clerkSetup();
});

setup("sign in the e2e admin and save session state", async ({ page }) => {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  if (!email) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL is not set. Create the dedicated e2e admin user in the Clerk " +
        "development instance, put its email here and its user_... id in ADMIN_USER_IDS.",
    );
  }

  // clerk.signIn needs ClerkProvider loaded, so start on the app before signing in with the
  // server-side testing token (no password or verification UI involved).
  await page.goto("/");
  await clerk.signIn({ page, emailAddress: email });

  // Reaching the dashboard proves both authentication and the ADMIN_USER_IDS allowlist entry;
  // requireAdmin 404s any signed-in user that is not allowlisted, and the 404 page has its own
  // h1, so the assertion must name the admin-only Dashboard heading.
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();

  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
