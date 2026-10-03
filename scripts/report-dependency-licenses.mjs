import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Hard cap on child-process output retained in memory; a larger inventory
// fails as a tooling error instead of exhausting the buffer.
const MAX_CHILD_OUTPUT_BYTES = 16 * 1024 * 1024;

const UNKNOWN_LABELS = new Set([
  "",
  "unknown",
  "unlicensed",
  "noassertion",
  "none",
  "null",
]);

export function summarizeLicenseGroups(groups) {
  if (!groups || typeof groups !== "object" || Array.isArray(groups)) {
    throw new Error("pnpm license report must be a JSON object");
  }

  const counts = {};
  let entries = 0;
  const unknownLabels = [];
  for (const [expression, packages] of Object.entries(groups)) {
    if (typeof expression !== "string" || !Array.isArray(packages)) {
      throw new Error("pnpm license report contains an invalid license group");
    }
    if (
      !packages.every(
        (item) =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      )
    ) {
      throw new Error("pnpm license report contains an invalid package entry");
    }
    counts[expression || "(missing)"] = packages.length;
    entries += packages.length;
    if (UNKNOWN_LABELS.has(expression.trim().toLowerCase()))
      unknownLabels.push(expression || "(missing)");
  }
  return { entries, licenses: counts, unknownLabels };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const result = spawnSync("pnpm", ["licenses", "list", "--json"], {
    encoding: "utf8",
    maxBuffer: MAX_CHILD_OUTPUT_BYTES,
  });
  if (result.error) {
    console.error("Unable to run pnpm licenses list --json");
    process.exitCode = 1;
  } else if (result.status !== 0) {
    console.error(
      `pnpm license inventory failed (exit ${result.status ?? "unknown"})`,
    );
    process.exitCode = result.status || 1;
  } else {
    try {
      const report = summarizeLicenseGroups(JSON.parse(result.stdout));
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } catch {
      console.error("Unable to parse pnpm license inventory JSON");
      process.exitCode = 1;
    }
  }
}
