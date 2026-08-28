import { test as setup } from "@playwright/test";

import { ADMIN_STORAGE_STATE, signInE2eAdmin } from "@/e2e/setup/clerk-admin";

setup("sign in the e2e admin and save session state", async ({ page }) => {
  await signInE2eAdmin(page);
  await page.context().storageState({ path: ADMIN_STORAGE_STATE });
});
