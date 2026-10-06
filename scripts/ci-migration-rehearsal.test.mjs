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

const scriptPath = "scripts/ci-migration-rehearsal.sh";
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

test("rejects when RUNNER_TEMP does not exist", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    RUNNER_TEMP: join(tmpdir(), "ef702-missing-runner-temp"),
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

test("fails closed when DATABASE_URL is absent", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    DATABASE_URL: undefined,
  });
  assertRejected(execution, /DATABASE_URL/);
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

test("ambient port override cannot permit an unguarded URL", () => {
  const execution = runScript(["--check-only"], {
    ...safeEnv,
    ESTATEFLOW_TEST_DB_PORT: "5432",
    DATABASE_URL: changedUrl({ port: "5432" }),
  });
  assertRejected(execution, /55433/);
});

test("unknown argument never starts the rehearsal", () => {
  const execution = runScript(["--dry-run"], safeEnv);
  assertRejected(execution, /unknown argument/);
});

function withPathWithoutDocker(run) {
  const directory = mkdtempSync(join(tmpdir(), "ef702-guard-path-"));
  symlinkSync(globalThis.process.execPath, join(directory, "node"));
  try {
    run(directory);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

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

test("check-only never echoes credentials or URLs", () => {
  withPathWithoutDocker((directory) => {
    const execution = runScript(["--check-only"], {
      ...safeEnv,
      PATH: directory,
    });
    assert.doesNotMatch(execution.stdout, /postgresql:\/\//);
    assert.doesNotMatch(execution.stderr, /postgresql:\/\//);
    assert.doesNotMatch(execution.stdout, /synthetic-test-only/);
    assert.doesNotMatch(execution.stderr, /synthetic-test-only/);
  });
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
      '  *"CREATE EXTENSION"*) exit 0 ;;',
      '  *"to_regclass"*) printf \'%s\\n\' "${FAKE_MISSING_TABLES:-t}" ;;',
      "  *\"finished_at IS NULL\"*) printf '%s\\n' '0' ;;",
      '  *"SELECT count(*) FROM \\"_prisma_migrations\\""*)',
      "    printf '%s\\n' \"${FAKE_MIGRATION_COUNT:-5}\" ;;",
      "esac",
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  writeFileSync(
    join(directory, "pnpm"),
    [
      "#!/usr/bin/env bash",
      'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"',
      'case "$*" in',
      '  *" migrate deploy"*) exit "${FAKE_MIGRATE_FAILURE:-0}" ;;',
      "esac",
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  symlinkSync(globalThis.process.execPath, join(directory, "node"));
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
          entry.startsWith("ef702-migration."),
        ),
    );
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test("pre-existing migration-verify database is never overwritten", () => {
  withFakeDocker((env, log) => {
    const execution = runScript([], { ...env, FAKE_EXISTING_DB: "1" });
    assertRejected(execution, /already exists/);
    assert.doesNotMatch(
      log(),
      /createdb|dropdb|CREATE EXTENSION|migrate deploy/,
    );
  });
});

test("compose port mismatch aborts before creating the target database", () => {
  withFakeDocker((env, log) => {
    writeFileSync(
      join(env.RUNNER_TEMP, "docker"),
      [
        "#!/usr/bin/env bash",
        'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"',
        'case "$*" in',
        "  *\" port postgres 5432\") printf '%s\\n' '0.0.0.0:55433' ;;",
        "esac",
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
    const execution = runScript([], env);
    assertRejected(execution, /55433/);
    assert.doesNotMatch(log(), /createdb|migrate deploy/);
  });
});

test("failed migration deploy cleans up the target database", () => {
  withFakeDocker((env, log) => {
    const execution = runScript([], { ...env, FAKE_MIGRATE_FAILURE: "17" });
    assertRejected(execution, /migrate deploy failed/);
    const entries = log().split("\n");
    const deployIndex = entries.findIndex((entry) =>
      entry.includes("migrate deploy"),
    );
    const dropIndex = entries.findIndex((entry) =>
      entry.includes("dropdb --force"),
    );
    assert.ok(deployIndex >= 0);
    assert.ok(dropIndex > deployIndex);
  });
});

test("successful rehearsal installs extensions, deploys twice, and cleans up", () => {
  withFakeDocker((env, log) => {
    const execution = runScript([], env);
    assert.equal(execution.status, 0, execution.stderr);
    assert.match(execution.stdout, /idempotent/);
    assert.match(execution.stdout, /cleaned up/);
    const entries = log().split("\n");
    assert.equal(
      entries.filter((entry) => entry.includes("CREATE EXTENSION")).length,
      2,
      "expected postgis and pgcrypto extension installation",
    );
    assert.match(log(), /CREATE EXTENSION IF NOT EXISTS postgis/);
    assert.match(log(), /CREATE EXTENSION IF NOT EXISTS pgcrypto/);
    assert.match(log(), /createdb/);
    assert.equal(
      entries.filter((entry) => entry.includes("migrate deploy")).length,
      2,
      "expected two migrate deploy runs to prove idempotence",
    );
    assert.match(log(), /dropdb --force/);
    assert.doesNotMatch(execution.stdout, /postgresql:\/\//);
    assert.doesNotMatch(execution.stdout, /synthetic-test-only/);
  });
});

test("failed extension installation never deploys and cleans up", () => {
  withFakeDocker((env, log) => {
    writeFileSync(
      join(env.RUNNER_TEMP, "docker"),
      [
        "#!/usr/bin/env bash",
        'printf \'%s\\n\' "$*" >> "$DOCKER_LOG"',
        'case "$*" in',
        "  *\" port postgres 5432\") printf '%s\\n' '127.0.0.1:55433' ;;",
        "  *\"SELECT 1 FROM pg_database\"*) printf '%s\\n' '' ;;",
        '  *"CREATE EXTENSION"*) printf "fake docker: extension denied\\n" >&2; exit 3 ;;',
        "esac",
        "",
      ].join("\n"),
      { mode: 0o700 },
    );
    const execution = runScript([], env);
    assertRejected(execution, /extension/);
    assert.doesNotMatch(log(), /migrate deploy/);
    assert.match(log(), /dropdb --force/);
  });
});

test("missing application tables after deploy fails closed", () => {
  withFakeDocker((env, log) => {
    const execution = runScript([], { ...env, FAKE_MISSING_TABLES: "f" });
    assertRejected(execution, /schema/);
    assert.match(log(), /dropdb --force/);
  });
});
