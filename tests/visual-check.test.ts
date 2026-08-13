import { describe, expect, test } from "bun:test";

import { parseArgs, planSlugs, resolveOutDir } from "@/scripts/visual-check";

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
  test("rejects unknown flags instead of treating them as routes", () => {
    expect(() => parseArgs(["--nope"])).toThrow("Unknown flag");
  });
});
