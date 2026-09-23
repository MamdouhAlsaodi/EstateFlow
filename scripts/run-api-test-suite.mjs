import { spawn } from "node:child_process";
import { readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const mode = process.argv[2];
if (mode !== "unit" && mode !== "integration") {
  throw new Error(
    "Usage: node scripts/run-api-test-suite.mjs <unit|integration>",
  );
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testDirectory = resolve(root, "apps/api/test");
const files = (await readdir(testDirectory))
  .filter((name) =>
    mode === "integration"
      ? name.endsWith(".integration.test.mjs")
      : name.endsWith(".test.mjs") && !name.endsWith(".integration.test.mjs"),
  )
  .sort();

if (files.length === 0) throw new Error(`No API ${mode} test files found`);

const integrationMarker = "/tmp/estateflow-api-integration.running";
if (mode === "integration") await writeFile(integrationMarker, "running\n");
try {
  for (const file of files) {
    const path = resolve(testDirectory, file);
    process.stdout.write(`\n=== API ${mode}: ${file} ===\n`);
    await run(process.execPath, ["--test", "--test-concurrency=1", path]);
  }

  process.stdout.write(`\nAPI ${mode} suite passed: ${files.length} files\n`);
} finally {
  if (mode === "integration") await rm(integrationMarker, { force: true });
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolvePromise();
      else
        reject(
          new Error(
            `${command} exited with ${code ?? `signal ${signal ?? "unknown"}`}`,
          ),
        );
    });
  });
}
