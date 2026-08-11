import { describe, expect, test } from "bun:test";

import {
  endpointHostFromUrl,
  GENERATED_MARKER,
  generatedNeonBranchId,
  isPooledUrl,
  parseEnvFile,
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
  });

  test("refuses to treat a hand-written file as generated", () => {
    // Teardown deletes files based on this check, so a manual override must never match.
    expect(generatedNeonBranchId("DATABASE_URL=x\nNEON_BRANCH_ID=br-manual")).toBeNull();
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
