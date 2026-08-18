import { describe, expect, test } from "bun:test";

import {
  classifyPrune,
  endpointHostFromUrl,
  GENERATED_MARKER,
  generatedNeonBranchId,
  isPooledUrl,
  type NeonBranch,
  type PruneWorktree,
  parseEnvFile,
  parseWorktreeList,
  renderOverrideEnv,
  waitForOperations,
} from "@/scripts/worktree-db";

describe("parseEnvFile", () => {
  test("reads values, skipping comments and blank lines", () => {
    const parsed = parseEnvFile(
      ["# comment", "", "DATABASE_URL=postgres://u:p@host/db?sslmode=require", "EMPTY="].join("\n"),
    );
    // Splitting at the first "=" must keep query strings intact.
    expect(parsed.DATABASE_URL).toBe("postgres://u:p@host/db?sslmode=require");
    expect(parsed.EMPTY).toBe("");
  });

  test("strips matching surrounding quotes", () => {
    const parsed = parseEnvFile(`A="quoted value"\nB='single'\nC="unbalanced`);
    expect(parsed.A).toBe("quoted value");
    expect(parsed.B).toBe("single");
    expect(parsed.C).toBe('"unbalanced');
  });
});

describe("endpointHostFromUrl", () => {
  test("strips Neon's -pooler suffix so the host matches the endpoints API", () => {
    expect(
      endpointHostFromUrl(
        "postgresql://user:pass@ep-calm-hat-a68sxa79-pooler.us-west-2.aws.neon.tech/neondb?sslmode=require",
      ),
    ).toBe("ep-calm-hat-a68sxa79.us-west-2.aws.neon.tech");
  });

  test("leaves direct (non-pooled) hosts unchanged", () => {
    expect(endpointHostFromUrl("postgresql://u:p@ep-x-1.us-west-2.aws.neon.tech/db")).toBe(
      "ep-x-1.us-west-2.aws.neon.tech",
    );
  });

  test("returns null for an unparseable URL", () => {
    expect(endpointHostFromUrl("not a url")).toBeNull();
  });
});

describe("isPooledUrl", () => {
  test("detects the pooler suffix on the endpoint label only", () => {
    expect(isPooledUrl("postgresql://u:p@ep-a-1-pooler.us-west-2.aws.neon.tech/db")).toBe(true);
    expect(isPooledUrl("postgresql://u:p@ep-a-1.us-west-2.aws.neon.tech/db")).toBe(false);
    expect(isPooledUrl("not a url")).toBe(false);
  });
});

describe("generated override files", () => {
  test("round-trips the Neon branch id through the rendered file", () => {
    const content = renderOverrideEnv({
      gitBranch: "fix/issue-77",
      neonBranchId: "br-example-123",
      databaseUrl: "postgresql://u:p@ep-a-1-pooler.us-west-2.aws.neon.tech/db?sslmode=require",
    });
    expect(content.startsWith(GENERATED_MARKER)).toBe(true);
    expect(generatedNeonBranchId(content)).toBe("br-example-123");
    expect(parseEnvFile(content).DATABASE_URL).toBe(
      "postgresql://u:p@ep-a-1-pooler.us-west-2.aws.neon.tech/db?sslmode=require",
    );
    // The e2e suite refuses to seed unless the worktree database opted in.
    expect(parseEnvFile(content).E2E_DATABASE_URL).toBe(parseEnvFile(content).DATABASE_URL);
  });

  test("refuses to treat a hand-written file as generated", () => {
    // Teardown deletes files based on this check, so a manual override must never match.
    expect(generatedNeonBranchId("DATABASE_URL=x\nNEON_BRANCH_ID=br-manual")).toBeNull();
  });
});

describe("parseWorktreeList", () => {
  test("reads paths and branch names, treating detached worktrees as branchless", () => {
    const porcelain = [
      "worktree /repo/main",
      "HEAD aaa",
      "branch refs/heads/main",
      "",
      "worktree /repo/wt-feature",
      "HEAD bbb",
      "branch refs/heads/feat/pickup",
      "",
      "worktree /repo/wt-detached",
      "HEAD ccc",
      "detached",
      "",
    ].join("\n");
    expect(parseWorktreeList(porcelain)).toEqual([
      { path: "/repo/main", branch: "main" },
      { path: "/repo/wt-feature", branch: "feat/pickup" },
      { path: "/repo/wt-detached", branch: null },
    ]);
  });
});

describe("classifyPrune", () => {
  const neonBranch = (id: string, overrides?: Partial<NeonBranch>): NeonBranch => ({
    id,
    name: id,
    default: false,
    protected: false,
    ...overrides,
  });
  const worktree = (overrides: Partial<PruneWorktree>): PruneWorktree => ({
    path: "/repo/wt",
    branch: "feat/x",
    neonBranchId: null,
    hasGeneratedOverrides: false,
    merged: false,
    unsettledReason: null,
    ...overrides,
  });

  test("selects merged worktrees with overrides and unreferenced Neon branches", () => {
    const mergedWithDb = worktree({
      path: "/repo/wt-merged",
      neonBranchId: "br-merged",
      hasGeneratedOverrides: true,
      merged: true,
    });
    // Overrides without a recorded branch id (e.g. written before the id line existed) still
    // need their files cleaned up, so the worktree must be selected.
    const mergedFilesOnly = worktree({
      path: "/repo/wt-merged-files-only",
      hasGeneratedOverrides: true,
      merged: true,
    });
    const result = classifyPrune({
      neonBranches: [neonBranch("br-merged"), neonBranch("br-active"), neonBranch("br-orphan")],
      worktrees: [
        mergedWithDb,
        mergedFilesOnly,
        // Merged but never had a database: nothing to prune there.
        worktree({ path: "/repo/wt-merged-no-db", merged: true }),
        worktree({ path: "/repo/wt-active", neonBranchId: "br-active", merged: false }),
      ],
      excludedBranchIds: new Set(),
    });
    expect(result.mergedWorktrees).toEqual([mergedWithDb, mergedFilesOnly]);
    expect(result.orphanBranches.map((branch) => branch.id)).toEqual(["br-orphan"]);
  });

  test("never offers default, protected, or excluded branches as orphans", () => {
    const result = classifyPrune({
      neonBranches: [
        neonBranch("br-default", { default: true }),
        neonBranch("br-protected", { protected: true }),
        neonBranch("br-dev"),
      ],
      worktrees: [],
      // The shared dev branch is excluded by id, exactly as prune() builds this set.
      excludedBranchIds: new Set(["br-dev"]),
    });
    expect(result.orphanBranches).toEqual([]);
  });

  test("a merged worktree recording an excluded branch id is never a teardown candidate", () => {
    // Defense in depth for the shared dev branch: even a generated-looking override that
    // points at it must not route it into deletion via the merged-worktree path.
    const result = classifyPrune({
      neonBranches: [neonBranch("br-dev")],
      worktrees: [worktree({ neonBranchId: "br-dev", hasGeneratedOverrides: true, merged: true })],
      excludedBranchIds: new Set(["br-dev"]),
    });
    expect(result.mergedWorktrees).toEqual([]);
    expect(result.orphanBranches).toEqual([]);
  });

  test("an unsettled merged worktree is skipped, and its branch is not an orphan", () => {
    // The issue #121 incident: a merged branch the developer is still working in must keep
    // its database. It surfaces as skipped for reporting, never as a teardown candidate.
    const stillInUse = worktree({
      path: "/repo/wt-still-in-use",
      neonBranchId: "br-still-in-use",
      hasGeneratedOverrides: true,
      merged: true,
      unsettledReason: "uncommitted changes",
    });
    const result = classifyPrune({
      neonBranches: [neonBranch("br-still-in-use")],
      worktrees: [stillInUse],
      excludedBranchIds: new Set(),
    });
    expect(result.mergedWorktrees).toEqual([]);
    expect(result.skippedWorktrees).toEqual([stillInUse]);
    expect(result.orphanBranches).toEqual([]);
  });

  test("a branch referenced by an unmerged worktree is not an orphan", () => {
    const result = classifyPrune({
      neonBranches: [neonBranch("br-active")],
      worktrees: [worktree({ neonBranchId: "br-active" })],
      excludedBranchIds: new Set(),
    });
    expect(result.orphanBranches).toEqual([]);
  });
});

describe("waitForOperations", () => {
  test("polls until every operation reports finished", async () => {
    const statuses = ["running", "finished"];
    let polls = 0;
    const api = {
      getOperation: async (id: string) => ({ id, status: statuses[polls++] ?? "finished" }),
    };
    await waitForOperations(api, [{ id: "op-1", status: "running" }], 1);
    expect(polls).toBe(2);
  });

  test("throws when an operation reports a terminal failure", async () => {
    const api = { getOperation: async () => null };
    await expect(waitForOperations(api, [{ id: "op-1", status: "failed" }], 1)).rejects.toThrow(
      "op-1 failed",
    );
  });

  test("treats a 404 for a pending operation as an error, not as completion", async () => {
    // Setup must not proceed to connection-string fetch and migrations on a lookup failure.
    const api = { getOperation: async () => null };
    await expect(waitForOperations(api, [{ id: "op-1", status: "running" }], 1)).rejects.toThrow(
      "disappeared before finishing",
    );
  });
});
