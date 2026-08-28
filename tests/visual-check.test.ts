import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import {
  assertAdminAuthEnvironment,
  findAvailablePort,
  parseArgs,
  planSlugs,
  resolveOutDir,
  waitForOwnedDevServer,
} from "@/scripts/visual-check";

describe("resolveOutDir", () => {
  const cwd = "/repo";

  test("accepts a subdirectory of cwd", () => {
    expect(resolveOutDir(".visual-check", cwd)).toBe("/repo/.visual-check");
  });

  // The resolved directory is recursively deleted, so anything that is not a
  // strict child of cwd must be rejected before any filesystem mutation.
  test.each([".", "/", "..", "../sibling", "/tmp/elsewhere"])("rejects %s", (out) => {
    expect(() => resolveOutDir(out, cwd)).toThrow("--out must be a subdirectory");
  });
});

describe("planSlugs", () => {
  test("routes that normalize to the same slug get distinct filenames", () => {
    const plan = planSlugs(["/a/b", "/a-b", "/a_b"]);
    const values = [...plan.values()];
    expect(new Set(values).size).toBe(values.length);
    expect(plan.get("/a/b")).toBe("a-b");
  });

  test("root route falls back to home", () => {
    expect(planSlugs(["/"]).get("/")).toBe("home");
  });
});

describe("parseArgs", () => {
  test("starts the current worktree unless a base URL is explicit", () => {
    expect(parseArgs([])).toEqual({
      routes: ["/"],
      base: undefined,
      out: ".visual-check",
      auth: "none",
    });
    expect(parseArgs(["--base", "http://127.0.0.1:4321", "/products"])).toMatchObject({
      routes: ["/products"],
      base: "http://127.0.0.1:4321",
    });
  });

  test("accepts the admin authentication mode", () => {
    expect(parseArgs(["--auth", "admin", "/admin"])).toMatchObject({
      routes: ["/admin"],
      auth: "admin",
    });
  });

  test.each([
    [["--base"], "--base requires a value"],
    [["--out"], "--out requires a value"],
    [["--auth", "customer"], "Unsupported"],
    [["//example.com"], "same-origin"],
    [["/\\example.com"], "same-origin"],
  ])("rejects invalid flag values in %j", (args, message) => {
    expect(() => parseArgs(args)).toThrow(message);
  });

  test("rejects unknown flags instead of treating them as routes", () => {
    expect(() => parseArgs(["--nope"])).toThrow("Unknown flag");
  });
});

describe("waitForOwnedDevServer", () => {
  test("accepts a healthy spawned process after its readiness announcement", async () => {
    expect(
      await waitForOwnedDevServer({
        readinessUrl: "http://localhost:4310/favicon.ico",
        getExitCode: () => null,
        hasAnnouncedReady: () => true,
        checkUp: async () => true,
        sleep: async () => {},
        timeoutMs: 10,
      }),
    ).toBe("ready");
  });

  test("does not accept another process that claims the selected port", async () => {
    let exitCode: number | null = null;
    const result = await waitForOwnedDevServer({
      readinessUrl: "http://localhost:4310/favicon.ico",
      getExitCode: () => exitCode,
      hasAnnouncedReady: () => true,
      checkUp: async () => {
        exitCode = 1;
        return true;
      },
      sleep: async () => {},
      timeoutMs: 10,
    });

    expect(result).toBe("exited");
  });
});

describe("findAvailablePort", () => {
  test("returns a bindable non-privileged port", async () => {
    const port = await findAvailablePort();
    expect(port).toBeGreaterThan(1023);
    expect(port).toBeLessThanOrEqual(65_535);
  });
});

describe("assertAdminAuthEnvironment", () => {
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
    CLERK_SECRET_KEY: "sk_test_example",
    E2E_CLERK_USER_EMAIL: "admin@example.test",
  };

  test("accepts development credentials on loopback", () => {
    expect(() => assertAdminAuthEnvironment("http://127.0.0.1:4310", env)).not.toThrow();
  });

  test("rejects remote targets and production credentials", () => {
    expect(() => assertAdminAuthEnvironment("https://example.com", env)).toThrow("loopback");
    expect(() =>
      assertAdminAuthEnvironment("http://localhost:4310", {
        ...env,
        CLERK_SECRET_KEY: "sk_live_example",
      }),
    ).toThrow("development secret key");
  });
});

describe("admin authentication failure report", () => {
  test("writes report.json when the admin environment is invalid", async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.end("ok");
    });
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind");

    const out = `.visual-check-auth-failure-${process.pid}`;
    const outDir = join(process.cwd(), out);
    try {
      const visualCheck = Bun.spawn(
        [
          "bun",
          "scripts/visual-check.ts",
          "/admin",
          "--auth",
          "admin",
          "--base",
          `http://127.0.0.1:${address.port}`,
          "--out",
          out,
        ],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            CLERK_SECRET_KEY: "sk_live_invalid",
            E2E_CLERK_USER_EMAIL: "admin@example.test",
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_example",
          },
          stdout: "ignore",
          stderr: "ignore",
        },
      );

      expect(await visualCheck.exited).toBe(1);
      expect(JSON.parse(readFileSync(join(outDir, "report.json"), "utf8"))).toMatchObject({
        auth: "admin",
        failures: 1,
        error: "Admin visual checks require a Clerk development secret key",
      });
    } finally {
      await new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose())),
      );
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
