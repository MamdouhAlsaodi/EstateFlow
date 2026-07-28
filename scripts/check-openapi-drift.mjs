import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const root = globalThis.process.cwd();
const temporaryDirectory = await mkdtemp(
  resolve(tmpdir(), "estateflow-openapi-"),
);
const generatedDirectory = resolve(temporaryDirectory, "api-client");
const artifacts = ["openapi.json", "src/generated.ts"];

try {
  const generator = spawn(
    globalThis.process.execPath,
    ["scripts/generate-openapi.mjs", generatedDirectory],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
  const exitCode = await new Promise((resolveExit) => {
    generator.on("exit", (code) => resolveExit(code ?? 1));
  });

  if (exitCode !== 0) globalThis.process.exitCode = exitCode;
  else {
    for (const artifact of artifacts) {
      const [tracked, generated] = await Promise.all([
        readFile(resolve(root, "packages/api-client", artifact)),
        readFile(resolve(generatedDirectory, artifact)),
      ]);

      if (!tracked.equals(generated)) {
        throw new Error(`OpenAPI artifact drift detected: ${artifact}`);
      }
    }
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
