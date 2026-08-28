#!/usr/bin/env bun
/**
 * Capture full-page screenshots of app routes at common breakpoints so an agent
 * (or human) can visually judge styling, alignment, and hierarchy without
 * manual smoke testing.
 *
 * Usage:
 *   bun run visual-check [routes...] [--auth admin] [--base <url>] [--out <dir>]
 *
 * Routes default to "/". Without --base, the script starts this worktree on an
 * available loopback port and shuts it down afterward. The output directory is
 * wiped each run so stale screenshots from earlier code can't be mistaken for
 * current output. One PNG per route x breakpoint lands there, browser errors
 * are printed, and report.json records the complete run.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve, sep } from "node:path";
import nextEnv from "@next/env";
import { type Browser, type BrowserContext, chromium } from "playwright";

import { signInE2eAdmin } from "@/e2e/setup/clerk-admin";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

const SERVER_READY_TIMEOUT_MS = 90_000;
const NAV_TIMEOUT_MS = 60_000; // first hit compiles the route in dev
const SERVER_LOG_LIMIT = 12_000;
const SERVER_START_ATTEMPTS = 3;
type AuthMode = "none" | "admin";
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

function requireFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value || value.startsWith("-")) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseArgs(argv: string[]) {
  const routes: string[] = [];
  let base: string | undefined;
  let out = ".visual-check";
  let auth: AuthMode = "none";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") base = requireFlagValue(argv, i++, arg);
    else if (arg === "--out") out = requireFlagValue(argv, i++, arg);
    else if (arg === "--auth") {
      const value = requireFlagValue(argv, i++, arg);
      if (value !== "admin") throw new Error(`Unsupported auth mode: ${value}`);
      auth = value;
    } else if (arg.startsWith("-")) throw new Error(`Unknown flag: ${arg}`);
    else {
      const route = arg.startsWith("/") ? arg : `/${arg}`;
      if (route.startsWith("//") || route.includes("\\")) {
        throw new Error(`Route must be same-origin: ${arg}`);
      }
      routes.push(route);
    }
  }
  return { routes: routes.length ? routes : ["/"], base, out, auth };
}

// The output directory is recursively deleted every run, so confine it to a
// strict subdirectory of cwd: `--out .`, `--out /`, or a path outside the
// repository would otherwise delete a tree that was never ours to manage.
export function resolveOutDir(out: string, cwd: string): string {
  const resolved = resolve(cwd, out);
  if (resolved === resolve(cwd) || !resolved.startsWith(resolve(cwd) + sep)) {
    throw new Error(`--out must be a subdirectory of ${cwd}, got: ${resolved}`);
  }
  return resolved;
}

// Filesystem-safe name for a route, e.g. "/admin/orders?page=2" -> "admin-orders-page-2".
function slugify(route: string): string {
  const slug = route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "home";
}

// Distinct routes can normalize to the same slug ("/a/b" and "/a-b"), which
// would silently overwrite one route's screenshots with the other's. Suffix
// collisions with a counter so every route keeps its own files.
export function planSlugs(routes: string[]): Map<string, string> {
  const used = new Map<string, number>();
  const plan = new Map<string, string>();
  for (const route of routes) {
    const slug = slugify(route);
    const count = used.get(slug) ?? 0;
    used.set(slug, count + 1);
    plan.set(route, count === 0 ? slug : `${slug}-${count + 1}`);
  }
  return plan;
}

async function isUp(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

/** Drains a server stream while retaining only enough output to diagnose a failed run. */
async function collectLogTail(
  stream: number | ReadableStream<Uint8Array> | undefined,
  onOutput?: (output: string) => void,
): Promise<string> {
  if (!stream || typeof stream === "number") return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output = (output + decoder.decode(value, { stream: true })).slice(-SERVER_LOG_LIMIT);
    onOutput?.(output);
  }

  return (output + decoder.decode()).slice(-SERVER_LOG_LIMIT).trim();
}

type DevServerReadiness = "ready" | "exited" | "timeout";

/** Accepts readiness only after the spawned Next process announces it and answers HTTP. */
export async function waitForOwnedDevServer({
  readinessUrl,
  getExitCode,
  hasAnnouncedReady,
  checkUp = isUp,
  sleep = Bun.sleep,
  timeoutMs = SERVER_READY_TIMEOUT_MS,
}: {
  readinessUrl: string;
  getExitCode: () => number | null;
  hasAnnouncedReady: () => boolean;
  checkUp?: (url: string) => Promise<boolean>;
  sleep?: (milliseconds: number) => Promise<unknown>;
  timeoutMs?: number;
}): Promise<DevServerReadiness> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (getExitCode() !== null) return "exited";
    if (hasAnnouncedReady() && (await checkUp(readinessUrl))) {
      return getExitCode() === null ? "ready" : "exited";
    }
    await sleep(500);
  }
  return "timeout";
}

/** Finds a currently unused loopback port for this worktree's temporary dev server. */
export async function findAvailablePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port"));
        return;
      }
      server.close((error) => (error ? reject(error) : resolvePort(address.port)));
    });
  });
}

/** Keeps the test admin session on loopback and development Clerk credentials. */
export function assertAdminAuthEnvironment(baseUrl: string, env: NodeJS.ProcessEnv): void {
  const hostname = new URL(baseUrl).hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(hostname)) {
    throw new Error(`Admin visual checks require a loopback base URL, got ${baseUrl}`);
  }
  if (!env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_")) {
    throw new Error("Admin visual checks require a Clerk development publishable key");
  }
  if (!env.CLERK_SECRET_KEY?.startsWith("sk_test_")) {
    throw new Error("Admin visual checks require a Clerk development secret key");
  }
  if (!env.E2E_CLERK_USER_EMAIL) {
    throw new Error("Admin visual checks require E2E_CLERK_USER_EMAIL");
  }
}

/** Signs in once, then returns an in-memory state reused by every screenshot context. */
async function createAdminStorageState(browser: Browser, baseUrl: string): Promise<StorageState> {
  const context = await browser.newContext({ baseURL: baseUrl });
  try {
    const page = await context.newPage();
    await signInE2eAdmin(page);
    return await context.storageState();
  } finally {
    await context.close();
  }
}

async function main(): Promise<number> {
  const { routes, base, out, auth } = parseArgs(process.argv.slice(2));
  const outDir = resolveOutDir(out, process.cwd());
  const slugs = planSlugs(routes);

  let baseUrl: string | undefined;
  let devServer: ReturnType<typeof Bun.spawn> | undefined;
  let devServerLogs: Promise<string[]> | undefined;

  async function stopDevServer(showLogs: boolean): Promise<void> {
    if (!devServer) return;
    if (devServer.exitCode === null) devServer.kill();
    await devServer.exited;
    if (showLogs && devServerLogs) {
      const logTail = (await devServerLogs).filter(Boolean).join("\n");
      if (logTail) console.error(`\nDev server log tail:\n${logTail}`);
    }
    devServer = undefined;
    devServerLogs = undefined;
  }

  // Everything below runs inside try/finally so a failure at any point still
  // shuts down the dev server we spawned and the browser we launched.
  try {
    if (base) {
      baseUrl = new URL(base).origin;
      if (!(await isUp(new URL("/favicon.ico", baseUrl).href))) {
        console.error(`No server is listening at the explicit base URL ${baseUrl}.`);
        return 1;
      }
      console.log(`Using explicit server ${baseUrl}`);
    } else {
      let ready = false;
      for (let attempt = 1; attempt <= SERVER_START_ATTEMPTS; attempt++) {
        const port = await findAvailablePort();
        // Clerk's development middleware canonicalizes its browser origin to localhost.
        baseUrl = `http://localhost:${port}`;
        console.log(`Starting this worktree's dev server on ${baseUrl} ...`);
        let announcedReady = false;
        devServer = Bun.spawn(
          ["bun", "run", "dev", "--hostname", "localhost", "--port", String(port)],
          {
            stdout: "pipe",
            stderr: "pipe",
          },
        );
        devServerLogs = Promise.all([
          collectLogTail(devServer.stdout, (output) => {
            if (output.includes("Ready in")) announcedReady = true;
          }),
          collectLogTail(devServer.stderr),
        ]);
        const readiness = await waitForOwnedDevServer({
          readinessUrl: new URL("/favicon.ico", baseUrl).href,
          getExitCode: () => (devServer ? devServer.exitCode : 1),
          hasAnnouncedReady: () => announcedReady,
        });
        if (readiness === "ready") {
          ready = true;
          break;
        }

        const retrying = attempt < SERVER_START_ATTEMPTS;
        console.error(
          `Dev server ${readiness === "exited" ? "exited before readiness" : "timed out"}.${retrying ? " Retrying on another port." : ""}`,
        );
        await stopDevServer(!retrying);
      }
      if (!ready) return 1;
    }
    if (!baseUrl) return 1;

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });

    if (auth === "admin") {
      try {
        nextEnv.loadEnvConfig(process.cwd());
        assertAdminAuthEnvironment(baseUrl, process.env);
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        writeFileSync(
          join(outDir, "report.json"),
          `${JSON.stringify({ auth, routes, viewports: VIEWPORTS, failures: 1, results: [], error }, null, 2)}\n`,
        );
        console.error(`FAIL visual-check setup: ${error}`);
        return 1;
      }
    }

    let browser: Browser;
    try {
      browser = await chromium.launch();
    } catch (err) {
      console.error(String(err));
      console.error("If Chromium is missing, run: bun x playwright install chromium");
      return 1;
    }

    let failures = 0;
    let runError: string | undefined;
    const results: Array<{
      route: string;
      viewport: string;
      width: number;
      height: number;
      status?: number;
      screenshot?: string;
      consoleErrors: string[];
      error?: string;
    }> = [];
    try {
      const storageState =
        auth === "admin" ? await createAdminStorageState(browser, baseUrl) : undefined;
      for (const viewport of VIEWPORTS) {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          // Freeze CSS animations/transitions so screenshots are stable and
          // mid-animation frames aren't misjudged as layout bugs.
          reducedMotion: "reduce",
          ...(storageState ? { storageState } : {}),
        });
        for (const route of routes) {
          const page = await context.newPage();
          const consoleErrors: string[] = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") consoleErrors.push(msg.text());
          });
          page.on("pageerror", (err) => consoleErrors.push(err.message));
          const label = `${route} @ ${viewport.name} (${viewport.width}x${viewport.height})`;
          try {
            const response = await page.goto(new URL(route, baseUrl).href, {
              waitUntil: "load",
              timeout: NAV_TIMEOUT_MS,
            });
            // Hide the Next.js dev-tools indicator so it isn't misjudged as UI.
            await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
            // Wait for webfonts plus a short settle so text metrics and
            // client-hydrated content are in their final layout.
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(300);
            const file = join(outDir, `${slugs.get(route)}.${viewport.name}.png`);
            await page.screenshot({ path: file, fullPage: true });
            const status = response?.status() ?? 0;
            results.push({
              route,
              viewport: viewport.name,
              width: viewport.width,
              height: viewport.height,
              status,
              screenshot: file.slice(outDir.length + 1),
              consoleErrors: [...new Set(consoleErrors)],
            });
            // Server errors fail the run; redirects (e.g. auth) are captured as-is
            // and left for the viewer to judge.
            if (status >= 500) {
              failures++;
              console.error(`FAIL ${label}: HTTP ${status} (screenshot saved: ${file})`);
            } else {
              console.log(`ok   ${label} -> ${file}`);
            }
          } catch (err) {
            failures++;
            const error = err instanceof Error ? err.message : String(err);
            results.push({
              route,
              viewport: viewport.name,
              width: viewport.width,
              height: viewport.height,
              consoleErrors: [...new Set(consoleErrors)],
              error,
            });
            console.error(`FAIL ${label}: ${error}`);
          }
          for (const text of new Set(consoleErrors)) {
            console.error(`     console error [${label}]: ${text}`);
          }
          await page.close();
        }
        await context.close();
      }
    } catch (err) {
      failures++;
      runError = err instanceof Error ? err.message : String(err);
      console.error(`FAIL visual-check setup: ${runError}`);
    } finally {
      await browser.close();
    }

    const reportFile = join(outDir, "report.json");
    writeFileSync(
      reportFile,
      `${JSON.stringify({ auth, routes, viewports: VIEWPORTS, failures, results, error: runError }, null, 2)}\n`,
    );
    console.log(
      `\n${results.filter((result) => result.screenshot).length} screenshot(s) and report.json in ${out}/${failures ? `, ${failures} failure(s)` : ""}`,
    );
    if (failures) await stopDevServer(true);
    return failures ? 1 : 0;
  } finally {
    await stopDevServer(false);
  }
}

if (import.meta.main) {
  try {
    process.exit(await main());
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  }
}
