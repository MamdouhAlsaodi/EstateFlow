import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const trackedArtifacts = [
  "packages/api-client/openapi.json",
  "packages/api-client/src/generated.ts",
];
const sensitiveMarker = "runtime-config-sensitive-marker";

function runNode(script, args, env) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolveResult({ code: code ?? 1, signal, stdout, stderr }),
    );
  });
}

test("OpenAPI generation owns a safe synthetic runtime and preserves tracked artifacts", async () => {
  const before = await Promise.all(
    trackedArtifacts.map((path) => readFile(resolve(root, path))),
  );
  const temporaryDirectory = await mkdtemp(
    resolve(tmpdir(), "estateflow-openapi-runtime-"),
  );
  const generatedDirectory = resolve(temporaryDirectory, "api-client");
  const environment = { ...process.env };
  for (const name of [
    "NODE_ENV",
    "ESTATEFLOW_BROWSER_ORIGIN",
    "ESTATEFLOW_AUTH_HASH_KEY",
    "ESTATEFLOW_AUDIT_HASH_KEY",
    "ESTATEFLOW_AUTH_FAKE_DELIVERY",
    "DATABASE_URL",
  ])
    delete environment[name];
  Object.assign(environment, {
    ESTATEFLOW_BROWSER_ORIGIN: sensitiveMarker,
    ESTATEFLOW_AUTH_HASH_KEY: sensitiveMarker,
    ESTATEFLOW_AUDIT_HASH_KEY: sensitiveMarker,
    ESTATEFLOW_AUTH_FAKE_DELIVERY: "false",
    DATABASE_URL: `postgresql://${sensitiveMarker}@127.0.0.1:1/unused`,
  });

  try {
    const generation = await runNode(
      "scripts/generate-openapi.mjs",
      [generatedDirectory],
      environment,
    );
    assert.equal(generation.code, 0, generation.stderr || generation.stdout);
    assert.equal(generation.signal, null);

    const openApi = JSON.parse(
      await readFile(resolve(generatedDirectory, "openapi.json"), "utf8"),
    );
    assert.match(openApi.openapi, /^3\./);
    const generatedClient = await readFile(
      resolve(generatedDirectory, "src/generated.ts"),
      "utf8",
    );
    assert.match(generatedClient, /export/);
    assert.equal(JSON.stringify(openApi).includes(sensitiveMarker), false);
    assert.equal(generatedClient.includes(sensitiveMarker), false);
    const output = `${generation.stdout}\n${generation.stderr}`;
    assert.equal(output.includes(sensitiveMarker), false);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  const after = await Promise.all(
    trackedArtifacts.map((path) => readFile(resolve(root, path))),
  );
  for (let index = 0; index < before.length; index += 1) {
    assert.deepEqual(after[index], before[index], trackedArtifacts[index]);
  }
});
