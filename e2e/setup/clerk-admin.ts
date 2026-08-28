import { createClerkClient } from "@clerk/backend";
import { clerkSetup } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

export const ADMIN_STORAGE_STATE = "e2e/.clerk/admin.json";

/** Adds Clerk's test token without fetching intercepted responses through Playwright. */
async function installClerkTestingToken(page: Page): Promise<void> {
  await clerkSetup();
  const frontendApi = process.env.CLERK_FAPI;
  const testingToken = process.env.CLERK_TESTING_TOKEN;
  if (!frontendApi || !testingToken) {
    throw new Error("Clerk testing setup did not provide its frontend API and testing token");
  }

  // @clerk/testing's response-fetching handler cannot follow Clerk's relative dev-browser
  // redirect with this Playwright version. Continuing the browser request preserves normal
  // redirect handling while still attaching the development-only testing token.
  await page.context().route(
    (url) =>
      url.protocol === "https:" && url.hostname === frontendApi && url.pathname.startsWith("/v1/"),
    async (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set("__clerk_testing_token", testingToken);
      await route.continue({ url: url.href });
    },
  );
}

/** Signs the configured development-only E2E administrator into a page with Clerk loaded. */
export async function signInE2eAdmin(page: Page): Promise<void> {
  const email = process.env.E2E_CLERK_USER_EMAIL;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!email) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL is not set. Create the dedicated e2e admin user in the Clerk " +
        "development instance, put its email here and its user_... id in ADMIN_USER_IDS.",
    );
  }
  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error("Admin browser checks require a Clerk development secret key");
  }

  await installClerkTestingToken(page);

  // The ticket is created on the trusted test runner, then activated by Clerk's browser SDK.
  await page.goto("/");
  await page.waitForFunction(() => window.Clerk?.loaded);
  const client = createClerkClient({ secretKey });
  const users = await client.users.getUserList({ emailAddress: [email] });
  const user = users.data[0];
  if (!user) throw new Error(`No Clerk user found for E2E_CLERK_USER_EMAIL: ${email}`);
  const ticket = await client.signInTokens.createSignInToken({
    userId: user.id,
    expiresInSeconds: 300,
  });
  await page.evaluate(async (token) => {
    const signIn = await window.Clerk.client?.signIn.create({
      strategy: "ticket",
      ticket: token,
    });
    if (signIn?.status !== "complete") {
      throw new Error(`Clerk ticket sign-in returned ${signIn?.status ?? "no result"}`);
    }
    await window.Clerk.setActive({ session: signIn.createdSessionId });
  }, ticket.token);
  await page.waitForFunction(() => window.Clerk?.user !== null);

  // The Dashboard heading proves both Clerk authentication and the separate admin allowlist.
  await page.goto("/admin");
  await page.getByRole("heading", { name: "Dashboard", level: 1 }).waitFor();
}
