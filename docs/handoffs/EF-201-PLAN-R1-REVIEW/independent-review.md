# EF-201-PLAN-R1 Independent Review

## Status
**BLOCKED** — do not grant G2 approval.

## Goal
Independently verify that EF-201-PLAN-R1 resolves every prior EF-201 plan-review blocker, with special attention to destructive-test guard semantics and named-test execution.

## Allowed paths used
- `docs/handoffs/EF-201-G1/approved-baseline.md`
- `docs/handoffs/EF-201-G1/approved-amendment.md`
- `docs/handoffs/EF-201-PLAN/implementation-plan.md`
- `docs/handoffs/EF-201-PLAN-REVIEW/independent-review.md`
- `docs/handoffs/EF-201-PLAN-R1/implementation-plan.md`
- `package.json`
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- Existing auth/organization/test integration setup under `apps/api/test/**`
- `scripts/assert-test-database.mjs` (explicitly requested guard-semantic inspection)

## Files changed
- Created this artifact only: `docs/handoffs/EF-201-PLAN-R1-REVIEW/independent-review.md`.
- No source, config, schema, or test file was edited.

## Prior blocker verdicts

### 1. Planned feature tests omitted by root test globs — PASS
R1 moves new tests to the existing API root:
`apps/api/test/*.test.mjs` and `apps/api/test/*.integration.mjs`.
The API scripts are:

- `test`: `pnpm run build && node --test test/*.test.mjs`
- `test:integration`: guard, generate, migrate, build, then `node --test --test-concurrency=1 test/*.integration.mjs`

The direct commands in R1 use explicit paths such as `node --test apps/api/test/ef201-property.application.test.mjs`; Node's test runner therefore receives and runs the named files directly. R1 correctly distinguishes direct named-file evidence from package-wide `pnpm test` regression evidence. The former nested-test omission is repaired.

### 2. API route/DTO contract not approved or specified — PASS
R1 records exact minimum DTOs, response shapes, cursor/query constraints, routes, guards, status/error mapping, and exclusions. It explicitly states that G2 is still required and that the executor may not add routes or fields. This resolves the prior lack of an executable HTTP boundary, subject to the human G2 decision.

### 3. Required Property fields materially ambiguous — PASS
R1 specifies the complete persisted Property, Listing, and image-metadata field sets, nullability, ownership meaning, lifecycle states, version fields, and prohibited additions. `ownerReference` is expressly operational text and not a User/contact relation. This resolves the prior field ambiguity.

### 4. Integration command was not reliably isolated or named — BLOCKED
R1 correctly replaces the old recursive-script invocation with direct named-file commands:
`node --test --test-concurrency=1 apps/api/test/ef201-property.repository.integration.test.mjs` and the equivalent HTTP command. The named path is consequently not merely an undocumented argument and will be selected by Node.

However, the preceding guard commands are written as:

```bash
pnpm db:test:guard
```

This is not executable under the documented environment unless `ALLOW_DESTRUCTIVE_TESTS=1` is also set. `package.json` maps this command to `node scripts/assert-test-database.mjs`, whose first checks require `DATABASE_URL`, then explicitly throw unless `ALLOW_DESTRUCTIVE_TESTS === "1"`. The guard command itself therefore requires the opt-in; it does not merely pass that requirement to the later test process.

Observed safe verification with a synthetic approved target URL:

```text
DATABASE_URL=postgresql://estateflow_test:test_only@127.0.0.1:55433/estateflow_test pnpm db:test:guard
Error: Set ALLOW_DESTRUCTIVE_TESTS=1 to opt in to destructive integration tests.
... exit code 1
```

With the opt-in added, the guard reported:

```text
Destructive test database target accepted: estateflow_test on loopback:55433.
```

The guard validates URL shape only (PostgreSQL protocol, loopback host, port `55433`, user `estateflow_test`, database `/estateflow_test`); it does not connect to PostgreSQL or prove Docker availability, migration state, or cleanup. The R1 sequence is therefore blocked as written: it cannot reach migration or the named integration test through its declared guard command. T4 repeats the same defect.

**Required repair:** write `ALLOW_DESTRUCTIVE_TESTS=1 pnpm db:test:guard` (with the required runtime precondition) in T3, T4, and every copied T5 integration sequence. Keep the opt-in on the direct mutating test command as well. Preserve literal evidence of guard target acceptance and test cleanup; do not run a database or migration during this review.

### 5. Audit boundary omitted — PASS
R1 explicitly defers Property/listing/image audit events and prohibits repurposing `SecurityAuditEvent`. This is consistent with the approved amendment's audit boundary.

### 6. Node 24/pnpm runtime precondition omitted — PASS
R1 requires every command to begin with nvm activation and `nvm use 24.14.1`, and requires recording Node `v24.14.1` and pnpm `10.33.2`. The observed runtime matched both values.

## Integration setup observations

- Existing integration tests use the same exact guarded-target predicate: `ALLOW_DESTRUCTIVE_TESTS=1`, a PostgreSQL URL, loopback host, port `55433`, user `estateflow_test`, and database `estateflow_test`.
- Existing integration tests may be skipped when that predicate is false; the R1 direct commands must therefore retain the environment opt-in so named tests do not silently skip.
- `apps/api`'s `db:migrate:test` script is only `prisma migrate deploy --schema prisma/schema.prisma`; it does not invoke the guard and does not itself require `ALLOW_DESTRUCTIVE_TESTS`. The guard must be a separately successful prior command.
- Direct `node --test <named-file>` does select the named file, but it does not run the guard, migration, or cleanup automatically. R1's explicit setup order is appropriate only after correcting the guard invocation and obtaining real disposable-database evidence in the executor phase.

## Commands run and observed output

All commands used the required Node 24 precondition.

- `source ~/.nvm/nvm.sh && nvm use 24.14.1 && ... node --version` → `v24.14.1`
- `source ~/.nvm/nvm.sh && nvm use 24.14.1 && ... pnpm --version` → `10.33.2`
- `git status --short` and `git diff --name-only` → pre-existing changes were limited in the tracked diff to `docs/CURRENT_HANDOFF.md` and `docs/YUI_TECHNICAL_CONTEXT.md`; the worktree also contains unrelated untracked handoff directories and `.hermes/`. No EF-201 source/config/schema/test file was changed by this review.
- Guard without opt-in, using a synthetic loopback target URL → failed with `Set ALLOW_DESTRUCTIVE_TESTS=1 to opt in to destructive integration tests.`
- Guard with `ALLOW_DESTRUCTIVE_TESTS=1`, using the same synthetic URL → `Destructive test database target accepted: estateflow_test on loopback:55433.`

No test suite, build, migration, Docker, database mutation, destructive command, commit, push, deploy, or publication was run.

## Risks
- As written, T3/T4/T5 cannot establish the required integration evidence because their first guard command fails before setup.
- The guard's acceptance message is URL validation, not proof that the target is reachable or disposable; executor evidence must separately show the approved isolated setup and cleanup.
- Existing worktree changes make scope attribution dependent on the recorded baseline.

## Git/publication posture
No commit, push, deploy, migration execution, database mutation, Docker action, or publication was performed.

## Recommended next human decision
Do not grant G2. Amend the R1 integration command blocks to set `ALLOW_DESTRUCTIVE_TESTS=1` on the guard invocation, then request a fresh independent review. This review does not authorize T1 or any successor.
