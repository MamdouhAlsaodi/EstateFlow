import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const verifierPath = resolve("scripts/verify-ci-workflow.mjs");
const workflowPath = resolve(".github/workflows/estateflow-ci.yml");

function runVerifier(pathname) {
  return spawnSync(globalThis.process.execPath, [verifierPath, pathname], {
    encoding: "utf8",
  });
}

function withWorkflow(content, assertion) {
  const directory = mkdtempSync(join(tmpdir(), "estateflow-ci-workflow-"));
  const pathname = join(directory, "workflow.yml");

  try {
    writeFileSync(pathname, content);
    assertion(pathname);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

function assertRejected(workflow, expectedMessage) {
  withWorkflow(workflow, (pathname) => {
    const execution = runVerifier(pathname);

    assert.notEqual(execution.status, 0);
    assert.match(execution.stderr, expectedMessage);
  });
}

test("accepts the EstateFlow CI workflow contract", () => {
  const execution = runVerifier(workflowPath);

  assert.equal(execution.status, 0, execution.stderr);
  assert.match(execution.stdout, /CI workflow contract verified/);
});

test("rejects an unpinned action", () => {
  assertRejected("- uses: actions/checkout@v4\n", /full commit SHA/);
});

test("rejects missing always cleanup", () => {
  assertRejected("name: CI\n", /always cleanup/);
});

test("rejects an unsafe database target", () => {
  assertRejected(
    "DATABASE_URL: postgresql://localhost/estateflow\n",
    /unsafe database target/,
  );
});
