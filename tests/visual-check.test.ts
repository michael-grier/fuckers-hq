import { describe, expect, test } from "bun:test";

import {
  assertAdminAuthEnvironment,
  findAvailablePort,
  parseArgs,
  planSlugs,
  resolveOutDir,
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
  ])("rejects invalid flag values in %j", (args, message) => {
    expect(() => parseArgs(args)).toThrow(message);
  });

  test("rejects unknown flags instead of treating them as routes", () => {
    expect(() => parseArgs(["--nope"])).toThrow("Unknown flag");
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
