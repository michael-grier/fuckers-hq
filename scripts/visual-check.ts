#!/usr/bin/env bun
/**
 * Capture full-page screenshots of app routes at common breakpoints so an agent
 * (or human) can visually judge styling, alignment, and hierarchy without
 * manual smoke testing.
 *
 * Usage:
 *   bun run visual-check [routes...] [--base <url>] [--out <dir>]
 *
 * Routes default to "/". If nothing is listening at the base URL (default
 * http://localhost:3000), a dev server is started on a spare port and shut
 * down afterward. The output directory is wiped each run so stale screenshots
 * from earlier code can't be mistaken for current output. One PNG per
 * route x breakpoint lands there, and browser console/page errors are printed.
 */
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type Browser, chromium } from "playwright";

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
] as const;

// Port for the self-started dev server; off 3000 so we never fight an
// already-running one we merely failed to detect.
const FALLBACK_PORT = 4310;
const SERVER_READY_TIMEOUT_MS = 90_000;
const NAV_TIMEOUT_MS = 60_000; // first hit compiles the route in dev

function parseArgs(argv: string[]) {
  const routes: string[] = [];
  let base = "http://localhost:3000";
  let out = ".visual-check";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") base = argv[++i] ?? base;
    else if (arg === "--out") out = argv[++i] ?? out;
    else if (arg.startsWith("-")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(2);
    } else routes.push(arg.startsWith("/") ? arg : `/${arg}`);
  }
  return { routes: routes.length ? routes : ["/"], base, out };
}

async function isUp(url: string): Promise<boolean> {
  try {
    await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) });
    return true;
  } catch {
    return false;
  }
}

// Filesystem-safe name for a route, e.g. "/admin/orders?page=2" -> "admin-orders-page-2".
function slugify(route: string): string {
  const slug = route
    .replace(/^\//, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "home";
}

const { routes, base, out } = parseArgs(process.argv.slice(2));

let baseUrl = base;
let devServer: ReturnType<typeof Bun.spawn> | undefined;

if (!(await isUp(baseUrl))) {
  baseUrl = `http://localhost:${FALLBACK_PORT}`;
  console.log(`No server at ${base}; starting dev server on :${FALLBACK_PORT} ...`);
  devServer = Bun.spawn(["bun", "run", "dev", "--port", String(FALLBACK_PORT)], {
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS;
  while (!(await isUp(baseUrl))) {
    if (Date.now() > deadline || devServer.exitCode !== null) {
      devServer.kill();
      console.error("Dev server failed to become ready.");
      process.exit(1);
    }
    await Bun.sleep(500);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

let browser: Browser;
try {
  browser = await chromium.launch();
} catch (err) {
  console.error(String(err));
  console.error("If Chromium is missing, run: bun x playwright install chromium");
  devServer?.kill();
  process.exit(1);
}

let failures = 0;
const shots: string[] = [];

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    // Freeze CSS animations/transitions so screenshots are stable and
    // mid-animation frames aren't misjudged as layout bugs.
    reducedMotion: "reduce",
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
      const file = join(out, `${slugify(route)}.${viewport.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      shots.push(file);
      const status = response?.status() ?? 0;
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
      console.error(`FAIL ${label}: ${err instanceof Error ? err.message : err}`);
    }
    for (const text of new Set(consoleErrors)) {
      console.error(`     console error [${label}]: ${text}`);
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
devServer?.kill();

console.log(
  `\n${shots.length} screenshot(s) in ${out}/${failures ? `, ${failures} failure(s)` : ""}`,
);
process.exit(failures ? 1 : 0);
