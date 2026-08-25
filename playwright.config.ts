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
      testIgnore: ["**/admin/**", "**/setup/**"],
    },
    {
      name: "admin",
      testMatch: "**/admin/**",
      dependencies: ["clerk-setup"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.clerk/admin.json" },
    },
  ],
  webServer: {
    command: "bun run dev",
    url: baseURL,
    // Reuse a dev server already listening on the base URL (the same behavior as
    // scripts/visual-check.ts); boot one only when nothing is there.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
