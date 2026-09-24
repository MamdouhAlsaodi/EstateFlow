import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * EF-630 — "no hardcoded visible strings in feature code" enforcement.
 *
 * The scan rejects Arabic string literals in web feature/app code outside
 * the translation catalog. The allowlist below is the ONLY sanctioned
 * exception set; every entry carries a reason and the list must shrink to
 * empty as the sweep completes. Comments are ignored (not user-visible), as
 * is the synthetic demo DATA module (client/property names and illustrative
 * amounts are content, not UI copy).
 */

const SRC_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const SCAN_DIRS = ["features", "app"];

/**
 * Permanent exemption — synthetic demo DATA (not UI copy): EF-105
 * illustrative client/property names and display amounts rendered verbatim
 * as sample content. Every other surface has been swept to the catalog; the
 * scan now guards the whole feature/app tree (EF-630 R2 completion).
 */
const ALLOWED_FILES: Readonly<Record<string, string>> = {
  "app/ar/_components/design-system-demo.tsx":
    "synthetic demo data: client/property names and sample amounts",
};

test("no Arabic string literals outside the translation catalog (allowlist bounded)", async () => {
  const { globSync } = await import("node:fs");
  const violations: string[] = [];
  const literalWithArabic = /(['"`])[^'"`\n]*[\u0600-\u06FF][^'"`\n]*\1/g;

  for (const dir of SCAN_DIRS) {
    const files = globSync(`${dir}/**/*.{ts,tsx}`, { cwd: SRC_ROOT });
    for (const relative of files) {
      const normalized = relative.split(path.sep).join("/");
      if (normalized.startsWith("i18n/")) continue;
      if (normalized.startsWith("test/")) continue;
      if (normalized === "middleware.ts") continue;
      const source = await readFile(path.join(SRC_ROOT, relative), "utf8");
      const stripped = source
        // strip block comments and line comments (not user-visible)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const matches = stripped.match(literalWithArabic) ?? [];
      if (matches.length === 0) continue;
      const reason = ALLOWED_FILES[normalized];
      if (reason) continue; // counted below
      violations.push(`${normalized}: ${matches.length} literal(s)`);
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Arabic literals found outside the catalog:\n${violations.join("\n")}`,
  );
});

test("the hardcoded-string allowlist only contains real, justified files", async () => {
  const { globSync } = await import("node:fs");
  const existing = new Set(
    SCAN_DIRS.flatMap((dir) =>
      globSync(`${dir}/**/*.{ts,tsx}`, { cwd: SRC_ROOT }),
    ).map((p: string) => p.split(path.sep).join("/")),
  );
  for (const [file, reason] of Object.entries(ALLOWED_FILES)) {
    assert.ok(existing.has(file), `allowlist entry missing on disk: ${file}`);
    assert.ok(
      reason.trim().length > 0,
      `allowlist entry needs a reason: ${file}`,
    );
  }
});
