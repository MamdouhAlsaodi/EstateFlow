# EF-102 — Independent verification

**Verdict:** PASS
**Scope:** Isolated local and test service infrastructure

## Runtime smoke evidence

Both Compose stacks started successfully and were removed after verification.

| Stack | PostgreSQL database | PostGIS | Redis  | Host bindings                        |
| ----- | ------------------- | ------: | ------ | ------------------------------------ |
| local | `estateflow_local`  | `3.5.2` | `PONG` | `127.0.0.1:55432`, `127.0.0.1:56379` |
| test  | `estateflow_test`   | `3.5.2` | `PONG` | `127.0.0.1:55433`, `127.0.0.1:56380` |

The host listener inspection during the smoke test showed all four ports bound to `127.0.0.1` only.

## Safety evidence

- `docker compose ... config --quiet` passed for both stacks.
- `assert-test-database.mjs` rejected an explicit `estateflow_local` URL.
- The same guard accepted only `postgresql://estateflow_test:…@127.0.0.1:55433/estateflow_test` with `ALLOW_DESTRUCTIVE_TESTS=1`.
- Test PostgreSQL and Redis use `tmpfs`; they do not retain test state.
- Post-smoke cleanup audit found no EstateFlow containers and no bound EstateFlow ports.
- Existing host listeners on `5432` and `6379` were never used.

## Project checks

The following all passed:

```text
pnpm install --frozen-lockfile
docker compose -f infra/compose/docker-compose.local.yml config --quiet
docker compose -f infra/compose/docker-compose.test.yml config --quiet
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm format:check
```

## Corrections made during verification

1. `init.sql` was initially non-readable to the non-root PostgreSQL container user. It is now a public, non-secret SQL file with mode `644`.
2. The original PostgreSQL healthcheck used a Unix socket and could report healthy during image initialization. It now checks TCP `127.0.0.1`, eliminating that startup race.

## Intentional limitations

- No application schema, Prisma setup, migrations, API runtime, customer data, external credential, deployment, or real office data exists yet.
- The local stack is defined but is not left running after this verification.

## Next approved-task candidate

EF-103 — API bootstrap, configuration validation, health endpoints, error model, and observability baseline.
