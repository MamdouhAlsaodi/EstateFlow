import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

test("API test scripts isolate unit and integration files in separate processes", async () => {
  const runner = await readFile(
    new URL("scripts/run-api-test-suite.mjs", root),
    "utf8",
  );
  const manifest = JSON.parse(
    await readFile(new URL("apps/api/package.json", root), "utf8"),
  );

  assert.match(runner, /mode !== "unit" && mode !== "integration"/);
  assert.match(runner, /name\.endsWith\("\.integration\.test\.mjs"\)/);
  assert.match(
    runner,
    /name\.endsWith\("\.test\.mjs"\) && !name\.endsWith\("\.integration\.test\.mjs"\)/,
  );
  assert.match(runner, /for \(const file of files\)/);
  assert.match(runner, /spawn\(command, args/);

  assert.equal(
    manifest.scripts.test,
    "pnpm run build && node ../../scripts/run-api-test-suite.mjs unit",
  );
  assert.match(
    manifest.scripts["test:integration"],
    /assert-test-database\.mjs/,
  );
  assert.match(manifest.scripts["test:integration"], /db:migrate:test/);
  assert.match(
    manifest.scripts["test:integration"],
    /run-api-test-suite\.mjs integration$/,
  );
});
