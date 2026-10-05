import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const scriptPath = "scripts/ci-backup-restore-drill.sh";
const url = new URL("postgresql://");
url.hostname = "127.0.0.1";
url.port = "55433";
url.pathname = "/estateflow_test";
url.username = "estateflow_test";
url.password = "synthetic-test-only";
const safeDatabaseUrl = url.toString();

function changedUrl(fields) {
  const value = new URL(safeDatabaseUrl);
  Object.assign(value, fields);
  return value.toString();
}

const safeEnv = {
  ...globalThis.process.env,
  GITHUB_ACTIONS: "true",
  RUNNER_TEMP: globalThis.process.env.RUNNER_TEMP ?? tmpdir(),
  ALLOW_DESTRUCTIVE_TESTS: "1",
  ESTATEFLOW_TEST_DB_PORT: "55433",
  DATABASE_URL: safeDatabaseUrl,
};

function runScript(args, env) {
  return spawnSync("/bin/bash", [scriptPath, ...args], {
    encoding: "utf8",
    env,
  });
}

function assertRejected(execution, message) {
  assert.equal(typeof execution.status, "number", String(execution.error));
  assert.notEqual(execution.status, 0);
  assert.match(execution.stderr, message);
}

function withPathWithoutDocker(run) {
  const directory = mkdtempSync(join(tmpdir(), "ef702-guard-path-"));
  symlinkSync(globalThis.process.execPath, join(directory, "node"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("rejects when GITHUB_ACTIONS is not true", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    GITHUB_ACTIONS: undefined,
  });
  assertRejected(execution, /GITHUB_ACTIONS/);
});

test("rejects when RUNNER_TEMP is missing", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    RUNNER_TEMP: undefined,
  });
  assertRejected(execution, /RUNNER_TEMP/);
});

test("rejects when ALLOW_DESTRUCTIVE_TESTS is not 1", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    ALLOW_DESTRUCTIVE_TESTS: undefined,
  });
  assertRejected(execution, /ALLOW_DESTRUCTIVE_TESTS/);
});

test("rejects a DATABASE_URL targeting a non-loopback host", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    DATABASE_URL: changedUrl({ hostname: "db.invalid" }),
  });
  assertRejected(execution, /loopback/);
});

test("rejects a DATABASE_URL targeting the wrong database", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    DATABASE_URL: changedUrl({ pathname: "/estateflow_prod" }),
  });
  assertRejected(execution, /estateflow_test/);
});

test("rejects a DATABASE_URL targeting the wrong port", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    DATABASE_URL: changedUrl({ port: "5432" }),
  });
  assertRejected(execution, /55433/);
});

test("check-only passes without invoking Docker", () => {
  withPathWithoutDocker((directory) => {
    const execution = runScript(["--check-only"], {
      ...safeEnv,
      PATH: directory,
    });
    assert.equal(execution.status, 0, execution.stderr);
    assert.match(execution.stdout, /check-only/);
  });
});

test("fails closed when DATABASE_URL is absent", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    DATABASE_URL: undefined,
  });
  assertRejected(execution, /DATABASE_URL/);
});

test("unknown argument never starts the drill", () => {
  const execution = runScript(["--dry-run"], safeEnv);
  assertRejected(execution, /unknown argument/);
});

test("ambient port override cannot permit an unguarded URL", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    ESTATEFLOW_TEST_DB_PORT: "5432",
    DATABASE_URL: changedUrl({ port: "5432" }),
  });
  assertRejected(execution, /55433/);
});

function withFakeDocker(run) {
  const directory = mkdtempSync(join(tmpdir(), "ef702-fake-docker-"));
  const logPath = join(directory, "docker.log");
  writeFileSync(
    join(directory, "docker"),
    [
      "#!/usr/bin/env bash",
      'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"',
      'case "$*" in',
      "  *\" port postgres 5432\") printf '%s\\n' '127.0.0.1:55433' ;;",
      '  *"SELECT 1 FROM pg_database"*) printf \'%s\\n\' "${FAKE_EXISTING_DB:-}" ;;',
      "  *\"SELECT to_regclass\"*) printf '%s\\n' 't' ;;",
      "  *\" pg_dump \"*) printf '%s\\n' 'synthetic mock archive' ;;",
      '  *" pg_restore "*) exit "${FAKE_RESTORE_FAILURE:-0}" ;;',
      "  *\"SELECT drill_id\"*) printf '%s\\n' 'ef702|ci-synthetic-drill' ;;",
      "  *\"SELECT count(*)\"*) printf '%s\\n' '3' ;;",
      "esac",
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  try {
    return run(
      {
        ...safeEnv,
        PATH: `${directory}:${globalThis.process.env.PATH}`,
        RUNNER_TEMP: directory,
        DOCKER_LOG: logPath,
      },
      () => readFileSync(logPath, "utf8"),
      () =>
        readdirSync(directory).filter((entry) =>
          entry.startsWith("ef702-drill."),
        ),
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("pre-existing restore database is never overwritten", () => {
  withFakeDocker((env, log) => {
    const execution = runScript([], { ...env, FAKE_EXISTING_DB: "1" });
    assertRejected(execution, /already exists/);
    assert.doesNotMatch(log(), /createdb|dropdb|CREATE TABLE|pg_dump/);
  });
});

test("restore failure cleans only resources the drill created", () => {
  withFakeDocker((env, log, archives) => {
    const execution = runScript([], { ...env, FAKE_RESTORE_FAILURE: "42" });
    assertRejected(execution, /pg_restore failed/);
    const entries = log().split("\n");
    const restoreIndex = entries.findIndex((entry) =>
      entry.includes("pg_restore"),
    );
    const dropIndex = entries.findIndex((entry) =>
      entry.includes("dropdb --force"),
    );
    assert.ok(restoreIndex >= 0);
    assert.ok(dropIndex > restoreIndex);
    assert.ok(
      entries.findIndex((entry) => entry.includes("DROP TABLE")) > dropIndex,
    );
    assert.deepEqual(archives(), []);
  });
});

test("mocked successful restore verifies marker, table count, and cleanup", () => {
  withFakeDocker((env, log, archives) => {
    const execution = runScript([], env);
    assert.equal(execution.status, 0, execution.stderr);
    assert.match(execution.stdout, /verified.*3 public tables restored/);
    assert.match(
      execution.stdout,
      /temporary database, marker, and archive cleaned up/,
    );
    assert.match(log(), /pg_dump/);
    assert.match(log(), /pg_restore/);
    assert.deepEqual(archives(), []);
  });
});
