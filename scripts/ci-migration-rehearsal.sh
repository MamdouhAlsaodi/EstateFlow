#!/usr/bin/env bash
#
# EF-702 CI-only synthetic PostgreSQL migration rehearsal.
#
# Runs strictly inside the ephemeral GitHub Actions test PostgreSQL container:
# it creates a fresh, separate estateflow_migration_verify database in the
# SAME container, installs the baseline extensions from infra/postgres/init.sql,
# applies Prisma migrations with `migrate deploy`, and proves idempotence.
# The source estateflow_test database is never mutated. Fails closed unless
# every safety guard passes; never prints credential values or connection
# URLs; performs no artifact uploads and touches no production targets.
set -euo pipefail

DRILL_DATABASE="estateflow_migration_verify"
COMPOSE_FILE="infra/compose/docker-compose.test.yml"
COMPOSE_SERVICE="postgres"
SCHEMA_FILE="apps/api/prisma/schema.prisma"

fail() {
  printf 'ef702-migration-rehearsal: %s\n' "$1" >&2
  exit 1
}

check_only=false
case "$#:${1:-}" in
  0:"") ;;
  1:--check-only) check_only=true ;;
  *) fail "unknown argument or argument count" ;;
esac

# ---- Fail-closed environment guards (no Docker side effects) ---------------

[[ "${GITHUB_ACTIONS:-}" == "true" ]] ||
  fail "refusing to run outside GitHub Actions (GITHUB_ACTIONS must be true)"

[[ -n "${RUNNER_TEMP:-}" && -d "${RUNNER_TEMP:-}" ]] ||
  fail "refusing to run without an existing RUNNER_TEMP directory"

[[ "${ALLOW_DESTRUCTIVE_TESTS:-}" == "1" ]] ||
  fail "refusing to run without ALLOW_DESTRUCTIVE_TESTS=1"

[[ -n "${DATABASE_URL:-}" ]] ||
  fail "DATABASE_URL is required"

# The repository's canonical destructive-test guard validates the exact
# loopback PostgreSQL host, port, user, and database before any Docker call.
ESTATEFLOW_TEST_DB_PORT=55433 node scripts/assert-test-database.mjs >/dev/null ||
  fail "DATABASE_URL does not satisfy the isolated test-database guard (estateflow_test on loopback:55433 required)"

printf 'ef702-migration-rehearsal: guards accepted (estateflow_test on loopback:55433, CI-only synthetic data)\n'

if [[ "$check_only" == true ]]; then
  printf 'ef702-migration-rehearsal: check-only pass, no Docker or database work performed\n'
  exit 0
fi

# ---- Bounded rehearsal inside the ephemeral test container ------------------

compose_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T "$COMPOSE_SERVICE" "$@"
}

# Check the running service actually exposes only the expected loopback port;
# the URL guard alone does not identify the container that receives SQL.
actual_port="$(docker compose -f "$COMPOSE_FILE" port "$COMPOSE_SERVICE" 5432)"
[[ "$actual_port" == "127.0.0.1:55433" ]] || fail "test compose port does not match loopback:55433"

target_created=false
work_dir="$(mktemp -d "$RUNNER_TEMP/ef702-migration.XXXXXX")"
chmod 0700 "$work_dir"
deploy_log="$work_dir/migrate-deploy.log"
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  if [[ "$target_created" == true ]]; then
    compose_exec dropdb --force -U estateflow_test "$DRILL_DATABASE" >/dev/null 2>&1 || {
      printf 'ef702-migration-rehearsal: migration-verify database cleanup failed\n' >&2
      status=1
    }
  fi
  rm -f -- "$deploy_log"
  rmdir -- "$work_dir" 2>/dev/null || status=1
  if [[ "$status" == 0 ]]; then
    printf 'ef702-migration-rehearsal: migration-verify database and working directory cleaned up\n'
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Never overwrite a pre-existing database, even in the test stack.
existing_target="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -tA -c \
    "SELECT 1 FROM pg_database WHERE datname = '$DRILL_DATABASE';"
)"
[[ -z "$existing_target" ]] || fail "migration-verify database already exists"

compose_exec createdb -U estateflow_test "$DRILL_DATABASE"
target_created=true

# 1. Baseline extensions, mirroring infra/postgres/init.sql exactly.
compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -q \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;" ||
  fail "baseline extension installation failed (postgis)"
compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -q \
  -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" ||
  fail "baseline extension installation failed (pgcrypto)"

# 2. Locally construct the migration URL for the fresh target database only,
#    keeping the ephemeral password from the environment without echoing it.
migration_url="$(
  node -e "const u = new URL(process.env.DATABASE_URL); u.pathname = '/$DRILL_DATABASE'; process.stdout.write(u.toString())" 2>/dev/null
)" || fail "could not construct the isolated migration target URL"
[[ -n "$migration_url" ]] || fail "could not construct the isolated migration target URL"

# 3. Apply migrations with prisma migrate deploy, pointed ONLY at the fresh
#    database. Output is captured to a 0600 file under RUNNER_TEMP and only a
#    scrubbed tail is ever emitted, so no URL or credential value can leak.
deploy_migrations() {
  (
    cd apps/api &&
      DATABASE_URL="$migration_url" pnpm exec prisma migrate deploy --schema prisma/schema.prisma
  ) >"$deploy_log" 2>&1
}

scrubbed_tail() {
  sed -E 's#postgres(ql)?://[^[:space:]"]+#<scrubbed-url>#g' "$deploy_log" | tail -n 30 || true
}

deploy_migrations || {
  scrubbed_tail >&2
  fail "prisma migrate deploy failed against the fresh migration-verify database"
}

# 4. Assert required application tables and the migrations ledger exist.
schema_query="SELECT to_regclass('public.\"Organization\"') IS NOT NULL AND to_regclass('public.\"MediaAsset\"') IS NOT NULL AND to_regclass('public.\"_prisma_migrations\"') IS NOT NULL;"
target_schema="$(compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c "$schema_query")"
[[ "$target_schema" == "t" ]] || fail "expected application schema is absent from the migration-verify database"

failed_migrations="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c \
    'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL;'
)"
[[ "$failed_migrations" == "0" ]] || fail "migration ledger contains failed or unfinished migration rows"

migrations_before="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c \
    'SELECT count(*) FROM "_prisma_migrations";'
)"
[[ "$migrations_before" -gt 0 ]] || fail "migration ledger is empty after deploy"

# 5. Re-run deploy to prove idempotence: no new migration rows may appear.
deploy_migrations || {
  scrubbed_tail >&2
  fail "prisma migrate deploy failed on the idempotence re-run"
}
migrations_after="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c \
    'SELECT count(*) FROM "_prisma_migrations";'
)"
[[ "$migrations_after" == "$migrations_before" ]] ||
  fail "migrate deploy is not idempotent (before: $migrations_before, after: $migrations_after)"

printf 'ef702-migration-rehearsal: verified (idempotent deploy of %s migrations, schema and extension baseline present)\n' "$migrations_before"
