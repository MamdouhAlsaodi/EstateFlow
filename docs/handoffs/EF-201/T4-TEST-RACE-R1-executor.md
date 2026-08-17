# EF-201-T4-TEST-RACE-R1 Executor Report

## Status
PASS

## Change
- Modified only `apps/api/package.json`.
- Updated `scripts.test` to keep `pnpm run build` and add Node's serial flag: `node --test --test-concurrency=1 test/*.test.mjs`.
- No application code, test code, cleanup logic, dependencies, lockfiles, migrations, or infrastructure files changed.

## Root-cause evidence
- `apps/api/test/ef201-property.http.integration.test.mjs` and `apps/api/test/organization.http.integration.test.mjs` both call the shared `cleanupDatabase` against the same guarded `estateflow_test` database.
- Cleanup uses destructive `TRUNCATE ... RESTART IDENTITY CASCADE`; concurrent cleanup-owning integration tests can erase another test's session rows while its request is executing, producing the reproduced intermittent 401.
- This is a test-runner/database-isolation race, not product behavior. Serial execution removes the unsafe overlap without changing test behavior.

## Verification
1. Guarded database: `pnpm db:test:guard` accepted the loopback `estateflow_test` target; `pnpm --dir apps/api run db:migrate:test` reported no pending migrations.
2. Exact standard command with guarded database: `pnpm --dir apps/api run test` — **172 tests, 172 pass, 0 fail, 0 skipped**, exit 0.
3. Exact standard command without `DATABASE_URL`/`ALLOW_DESTRUCTIVE_TESTS`: `pnpm --dir apps/api run test` — **172 tests, 168 pass, 0 fail, 4 skipped**, exit 0; guarded integration tests retained skip behavior.
4. `git diff --check` — exit 0.

## Scope and lifecycle
- Changed files: `apps/api/package.json`, `docs/handoffs/EF-201/T4-TEST-RACE-R1-executor.md`.
- No commit, push, deploy, install, or credential/settings change performed.
- Pre-existing unrelated worktree changes were preserved and not included in this packet's change.
