import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const checker = fileURLToPath(
  new URL("./verify-security-baseline.mjs", import.meta.url),
);
function fixture(files = {}) {
  const cwd = mkdtempSync(join(tmpdir(), "ef701-security-"));
  execFileSync("git", ["init", "-q"], { cwd });
  execFileSync("git", ["config", "user.email", "test@example.invalid"], {
    cwd,
  });
  execFileSync("git", ["config", "user.name", "Fixture"], { cwd });
  for (const [path, value] of Object.entries(files)) {
    mkdirSync(join(cwd, path, ".."), { recursive: true });
    writeFileSync(join(cwd, path), value);
  }
  if (Object.keys(files).length)
    execFileSync("git", ["add", "--", ...Object.keys(files)], { cwd });
  return {
    cwd,
    run: (env = process.env) =>
      spawnSync(process.execPath, [checker], { cwd, encoding: "utf8", env }),
  };
}
function output(result) {
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}
function cleanup(repo) {
  rmSync(repo.cwd, { recursive: true, force: true });
}

test("scans staged blobs, not working-tree bytes; accepts exact example and source code", () => {
  const repo = fixture({
    ".env.example": "API_KEY=replace-me\n",
    "src/auth/credentials.ts": "export const credential = true;\n",
    "ordinary.txt": "safe",
  });
  try {
    writeFileSync(
      join(repo.cwd, "ordinary.txt"),
      `${"-----BEGIN "}PRIVATE KEY-----\nSYNTHETIC-WORKTREE-ONLY\n`,
    );
    assert.equal(repo.run().status, 0);
    execFileSync("git", ["add", "ordinary.txt"], { cwd: repo.cwd });
    assert.equal(repo.run().status, 1);
  } finally {
    cleanup(repo);
  }
});

test("rejects staged synthetic secrets and suppresses both value and path", () => {
  const secret = "SYNTHETIC-SECRET-DO-NOT-PRINT";
  const path = "credentials/private-oauth.json";
  const repo = fixture({ [path]: secret });
  try {
    const result = repo.run();
    assert.equal(result.status, 1);
    assert.doesNotMatch(output(result), new RegExp(secret));
    assert.doesNotMatch(output(result), /credentials\/private-oauth/);
  } finally {
    cleanup(repo);
  }
});

test("rejects sensitive directory and case variants, but only exact .env.example is exempt", () => {
  for (const path of [
    ".Env.Example",
    "vault/.AWS/config",
    "home/.SSH/id_rsa",
    "data/OAuth/token.json",
  ]) {
    const repo = fixture({ [path]: "synthetic" });
    try {
      assert.equal(repo.run().status, 1, path);
    } finally {
      cleanup(repo);
    }
  }
});

test("rejects tracked symlinks", () => {
  const repo = fixture();
  try {
    symlinkSync("target", join(repo.cwd, "link"));
    execFileSync("git", ["add", "link"], { cwd: repo.cwd });
    assert.equal(repo.run().status, 1);
  } finally {
    cleanup(repo);
  }
});

test("git failure fails closed without exposing cwd", () => {
  const repo = fixture({ "safe.txt": "safe" });
  try {
    const result = repo.run({ ...process.env, PATH: "" });
    assert.equal(result.status, 1);
    assert.doesNotMatch(output(result), new RegExp(repo.cwd));
  } finally {
    cleanup(repo);
  }
});
