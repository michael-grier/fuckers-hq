import { defineConfig, devices } from "@playwright/test";

// E2E_BASE_URL exists so a spec run can target an already-running server elsewhere on localhost;
// the global-setup guardrails still refuse anything that is not a loopback host.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  outputDir: ".e2e-artifacts/output",
  globalSetup: "./e2e/setup/global-setup",
  fullyParallel: true,
  // Zero retries on purpose: a spec that needs a retry is flaky, and agents rely on this suite
  // being deterministic. Fix or quarantine instead of retrying.
  retries: 0,
  // The dev server compiles routes on demand, so post-interaction refetches can stall well past
  // Playwright's 5s default while staying perfectly deterministic; 15s absorbs that.
  expect: { timeout: 15_000 },
  reporter: [["line"], ["json", { outputFile: ".e2e-artifacts/results.json" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // Signs in the dedicated e2e admin via @clerk/testing and caches the session, so only this
    // one project ever talks to Clerk's sign-in machinery.
    { name: "clerk-setup", testMatch: /setup\/clerk\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: ["**/admin/**", "**/commerce/**", "**/live/**", "**/setup/**"],
    },
    {
      name: "admin",
      testMatch: "**/admin/**",
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.clerk/admin.json" },
    },
    {
      // Opt-in external tier: real hosted-Checkout payment via the Stripe CLI and real R2
      // uploads. Every spec self-skips unless E2E_STRIPE_LIVE=1 (bun run test:e2e:live).
      name: "live",
      testMatch: "**/live/**",
      dependencies: ["clerk-setup"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.clerk/admin.json" },
    },
    {
      // Not fully parallel: these specs assert shared inventory state through the admin UI,
      // so interleaved reservations would make the numbers ambiguous.
      name: "commerce",
      testMatch: "**/commerce/**",
      dependencies: ["clerk-setup"],
      fullyParallel: false,
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.clerk/admin.json" },
    },
  ],
  webServer: {
    // CI builds first and serves the production bundle (E2E_WEB_SERVER_COMMAND="bun run start")
    // so specs are not racing on-demand dev compiles.
    command: process.env.E2E_WEB_SERVER_COMMAND ?? "bun run dev",
    url: baseURL,
    // E2E_BASE_URL is an explicit target, so reuse that server when it is already running.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
