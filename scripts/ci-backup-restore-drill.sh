#!/usr/bin/env bash
#
# EF-702 bounded backup/restore drill.
#
# CI-only: runs strictly inside the ephemeral GitHub Actions test PostgreSQL
# container against the isolated estateflow_test database using synthetic data.
# Fails closed unless every safety guard passes; never prints credential
# values; performs no artifact uploads and touches no production targets.
set -euo pipefail

DRILL_DATABASE="estateflow_restore_verify"
DRILL_MARKER_TABLE="ef702_drill_marker"
COMPOSE_FILE="infra/compose/docker-compose.test.yml"
COMPOSE_SERVICE="postgres"

fail() {
  printf 'ef702-drill: %s\n' "$1" >&2
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
  fail "DATABASE_URL does not satisfy the isolated test-database guard"

printf 'ef702-drill: guards accepted (estateflow_test on loopback:55433, CI-only synthetic data)\n'

if [[ "$check_only" == true ]]; then
  printf 'ef702-drill: check-only pass, no Docker or database work performed\n'
  exit 0
fi

# ---- Bounded drill inside the ephemeral test container ----------------------

compose_exec() {
  docker compose -f "$COMPOSE_FILE" exec -T "$COMPOSE_SERVICE" "$@"
}

# Check the running service actually exposes only the expected loopback port;
# the URL guard alone does not identify the container that receives SQL.
actual_port="$(docker compose -f "$COMPOSE_FILE" port "$COMPOSE_SERVICE" 5432)"
[[ "$actual_port" == "127.0.0.1:55433" ]] || fail "test compose port does not match loopback:55433"

archive_dir=""
marker_created=false
target_created=false
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  set +e
  if [[ "$target_created" == true ]]; then
    compose_exec dropdb --force -U estateflow_test "$DRILL_DATABASE" >/dev/null 2>&1 || {
      printf 'ef702-drill: restore-verify database cleanup failed\n' >&2
      status=1
    }
  fi
  if [[ "$marker_created" == true ]]; then
    compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test \
      -c "DROP TABLE \"$DRILL_MARKER_TABLE\";" >/dev/null 2>&1 || {
      printf 'ef702-drill: marker table cleanup failed\n' >&2
      status=1
    }
  fi
  if [[ -n "$archive_dir" ]]; then
    rm -f -- "$archive_dir/estateflow_test.dump" || status=1
    rmdir -- "$archive_dir" || status=1
  fi
  if [[ "$status" == 0 ]]; then
    printf 'ef702-drill: temporary database, marker, and archive cleaned up\n'
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Never overwrite a pre-existing database or marker, even in the test stack.
existing_target="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -tA -c \
    "SELECT 1 FROM pg_database WHERE datname = '$DRILL_DATABASE';"
)"
[[ -z "$existing_target" ]] || fail "restore-verify database already exists"
existing_marker="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -tA -c \
    "SELECT to_regclass('public.$DRILL_MARKER_TABLE') IS NULL;"
)"
[[ "$existing_marker" == "t" ]] || fail "synthetic marker table already exists"

schema_query="SELECT to_regclass('public.\"Organization\"') IS NOT NULL AND to_regclass('public.\"MediaAsset\"') IS NOT NULL AND to_regclass('public.\"_prisma_migrations\"') IS NOT NULL;"
source_schema="$(compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -tA -c "$schema_query")"
[[ "$source_schema" == "t" ]] || fail "expected application schema is absent from the test database"

# 1. Dedicated synthetic marker table + row in the isolated test database.
compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -q \
  -c "CREATE TABLE \"$DRILL_MARKER_TABLE\" (drill_id text NOT NULL, payload text NOT NULL);"
marker_created=true
compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -q \
  -c "INSERT INTO \"$DRILL_MARKER_TABLE\" (drill_id, payload) VALUES ('ef702', 'ci-synthetic-drill');"

# 2. pg_dump custom archive into a 0700 directory under RUNNER_TEMP.
archive_dir="$(mktemp -d "$RUNNER_TEMP/ef702-drill.XXXXXX")"
chmod 0700 "$archive_dir"
archive_path="$archive_dir/estateflow_test.dump"
compose_exec pg_dump -U estateflow_test -Fc estateflow_test >"$archive_path"
chmod 0600 "$archive_path"
[[ -s "$archive_path" ]] || fail "pg_dump produced an empty archive"

# 3. Fresh fixed restore-verify database inside the SAME test container.
compose_exec createdb -U estateflow_test "$DRILL_DATABASE"
target_created=true

# 4. Restore with --exit-on-error.
compose_exec pg_restore --exit-on-error -U estateflow_test -d "$DRILL_DATABASE" <"$archive_path" ||
  fail "pg_restore failed"

# 5. Assert marker exactness.
restored_marker="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c \
    "SELECT drill_id || '|' || payload FROM \"$DRILL_MARKER_TABLE\" WHERE drill_id = 'ef702';"
)"
[[ "$restored_marker" == "ef702|ci-synthetic-drill" ]] ||
  fail "restored marker row does not match the synthetic source marker"

# 6. Assert application schema presence and equal public table counts.
restored_schema="$(compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c "$schema_query")"
[[ "$restored_schema" == "t" ]] || fail "expected application schema is absent from the restored database"
source_tables="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d estateflow_test -tA -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"
restored_tables="$(
  compose_exec psql -v ON_ERROR_STOP=1 -U estateflow_test -d "$DRILL_DATABASE" -tA -c \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
)"
[[ "$restored_tables" -gt 0 ]] || fail "restore-verify database has no public tables"
[[ "$source_tables" == "$restored_tables" ]] ||
  fail "public table count mismatch (source: $source_tables, restored: $restored_tables)"

printf 'ef702-drill: verified (marker exact, %s public tables restored)\n' "$restored_tables"
