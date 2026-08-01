# EF-120-I — Independent Verification

**Date:** 2026-07-30
**Status:** PASS

## Authorized target

- Disposable Compose project: `estateflow-test`
- PostgreSQL: `estateflow_test` / `estateflow_test` on loopback `127.0.0.1:55433`
- Redis: loopback `127.0.0.1:56380`
- Destructive opt-in: `ALLOW_DESTRUCTIVE_TESTS=1`
- No development, shared, or production database was targeted.

## Runtime proof

- Compose configuration validation: PASS.
- Planned ports were free before startup.
- PostgreSQL and Redis containers reached healthy state.
- PostgreSQL TCP readiness: PASS.
- Connected identity: database `estateflow_test`, user `estateflow_test`.
- PostGIS runtime query: PASS (`3.5`).
- Redis `PING`: `PONG`.
- Negative database guard against a wrong port: PASS (rejected).
- Positive guard for the exact isolated target: PASS.
- Prisma migrations applied to the disposable test database only:
  - `20260727000000_database_baseline`
  - `20260730000000_ef120_auth`
- `prisma migrate status`: database schema up to date.
- Integration tests: 2/2 PASS:
  - wrong refresh hash rejected without mutation;
  - concurrent refresh reuse produces one rotation, one replay result, and family revocation;
  - baseline PostGIS and FK-safe cleanup behavior.
- Post-suite row counts: User=0, SessionFamily=0, RefreshSession=0, AccessSession=0.
- Applied successful migrations: 2.

## Independent non-database verification

- API unit tests: 14/14 PASS.
- Production config test: 1/1 PASS.
- Typecheck and Prisma client generation: PASS.
- Root lint, workspace boundaries, and infrastructure isolation checks: PASS.
- `git diff --check`: PASS.

## Teardown proof

- `docker compose down --volumes --remove-orphans`: PASS.
- No `estateflow-test-*` containers remain.
- No `estateflow-test_default` network remains.
- No listeners remain on ports `55433` or `56380`.

No dependency, environment-file, commit, push, deployment, development database, or production database action occurred.
