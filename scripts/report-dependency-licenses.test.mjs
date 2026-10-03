import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { summarizeLicenseGroups } from "./report-dependency-licenses.mjs";

test("summarizes grouped license expressions without package metadata", () => {
  assert.deepEqual(
    summarizeLicenseGroups({
      MIT: [
        { name: "synthetic-one", version: "1.0.0" },
        { name: "synthetic-two", version: "2.0.0" },
      ],
      "Apache-2.0": [{ name: "synthetic-three" }],
    }),
    {
      entries: 3,
      licenses: { MIT: 2, "Apache-2.0": 1 },
      unknownLabels: [],
    },
  );
});

test("marks absent or conventional unknown labels without judging known expressions", () => {
  const report = summarizeLicenseGroups({
    UNLICENSED: [{}],
    NOASSERTION: [{}],
  });
  assert.equal(report.entries, 2);
  assert.deepEqual(report.unknownLabels, ["UNLICENSED", "NOASSERTION"]);
  const expressions = summarizeLicenseGroups({
    "LGPL-3.0-or-later": [{}],
    "CC-BY-4.0": [{}],
  });
  assert.deepEqual(expressions.unknownLabels, []);
});

test("CLI reports pnpm spawn failures, nonzero exits, and malformed JSON", () => {
  const directory = mkdtempSync(join(tmpdir(), "license-cli-"));
  const script = new URL("./report-dependency-licenses.mjs", import.meta.url);
  const cli = fileURLToPath(script);
  const run = (body) => {
    const shim = join(directory, "pnpm");
    writeFileSync(shim, `#!/bin/sh\n${body}\n`);
    chmodSync(shim, 0o755);
    const result = spawnSync(process.execPath, [cli], {
      encoding: "utf8",
      env: { ...process.env, PATH: directory },
    });
    return result;
  };
  try {
    assert.match(run("exit 7").stderr, /exit 7/);
    assert.match(
      run("printf '{bad}'").stderr,
      /parse pnpm license inventory JSON/,
    );
    const missing = spawnSync(process.execPath, [cli], {
      encoding: "utf8",
      env: { ...process.env, PATH: join(directory, "empty") },
    });
    assert.notEqual(missing.status, 0);
    assert.match(missing.stderr, /Unable to run pnpm/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("CLI fails on output exceeding the bounded child buffer", () => {
  const directory = mkdtempSync(join(tmpdir(), "license-cli-bound-"));
  const script = new URL("./report-dependency-licenses.mjs", import.meta.url);
  const cli = fileURLToPath(script);
  const shim = join(directory, "pnpm");
  writeFileSync(shim, "#!/bin/sh\n/usr/bin/head -c 20000000 /dev/zero\n");
  chmodSync(shim, 0o755);
  try {
    const result = spawnSync(process.execPath, [cli], {
      encoding: "utf8",
      env: { ...process.env, PATH: directory },
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Unable to run pnpm/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects malformed group structures and entries", () => {
  assert.throws(() => summarizeLicenseGroups([]), /JSON object/);
  assert.throws(
    () => summarizeLicenseGroups({ MIT: {} }),
    /invalid license group/,
  );
  assert.throws(
    () => summarizeLicenseGroups({ MIT: [null] }),
    /invalid package entry/,
  );
});
