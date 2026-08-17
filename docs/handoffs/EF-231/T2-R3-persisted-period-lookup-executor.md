# Role Report — EF-231-T2-R3-PERSISTED-PERIOD-LOOKUP

## Status
PASS

## Goal
Closed the pre-HTTP period authority gap without changing HTTP, schema, migration, module, DTO, OpenAPI, client, or Web paths. Posting now accepts `periodId`, resolves an organization-scoped persisted `AccountingPeriod` through a mandatory typed repository port, and passes only that persisted period to domain posting.

## Allowed paths used
- `apps/api/src/features/finance/application/ledger-repository.ts`
- `apps/api/src/features/finance/application/ledger-application.ts`
- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts`
- `apps/api/test/ef231-ledger.application.test.mjs`
- `apps/api/test/ef231-ledger.repository.integration.test.mjs`
- `docs/handoffs/EF-231/T2-R3-persisted-period-lookup-executor.md`

## Files changed
- Added mandatory typed `findAccountingPeriod(organizationId, periodId): Promise<AccountingPeriod | null>`.
- Changed application posting input to `periodId`; authorization and entry scope checks precede lookup; absent periods return `{ kind: "not-found", resource: "accounting-period" }` before post mutation.
- Added Prisma composite-key lookup selecting/mapping exactly `id`, `organizationId`, `startsAt`, `endsAt`, and `status`.
- Added application coverage for persisted-period authority, absent/cross-organization rejection, and valid OPEN posting.
- Added guarded integration coverage for organization lookup isolation and cleanup preservation.

## Commands run

### TDD RED
```text
pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.application.test.mjs
```

Observed: exit `1`; `tests 13`, `pass 9`, `fail 4`. The predecessor dereferenced the removed `period` input (`TypeError: Cannot read properties of undefined (reading 'organizationId')`) and accepted caller period state, demonstrating the missing behavior.

### TDD GREEN and exact domain/application verification
```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.domain.test.mjs test/ef231-ledger.application.test.mjs
```

Observed: build exit `0`; `tests 20`, `pass 20`, `fail 0`, `cancelled 0`, `skipped 0`.

### Guarded persistence verification
```text
node scripts/assert-test-database.mjs
```

Observed: `Destructive test database target accepted: estateflow_test on loopback:55433.`

```text
pnpm --dir apps/api run db:generate && pnpm --dir apps/api run db:migrate:test
```

Observed: Prisma Client generated; `8 migrations found`; `No pending migrations to apply.`

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.repository.integration.test.mjs test/ef203-deal.repository.integration.test.mjs
```

Observed: build exit `0`; `tests 6`, `pass 6`, `fail 0`, `cancelled 0`, `skipped 0`. EF-231 integration passed `1/1`; EF-203 serial integration passed `5/5`.

### Scoped diff checks
```text
git diff --check -- <six allowed paths>
```

Observed: exit `0`.

Additional scoped whitespace check observed: `scoped whitespace check: clean`.

## Verification
- Caller-supplied period dates/status are not in the TypeScript application post contract; the regression supplied a forged closed/out-of-range extra property and confirmed the persisted OPEN period was used.
- Missing and cross-organization period IDs return typed not-found without invoking repository post mutation.
- Prisma lookup is mandatory, typed, and organization-scoped via `organizationId_id`; integration verified own-org hits, foreign-org isolation, and cleanup.
- No schema, migration, HTTP, or unrelated finance path was changed.
- `clean-code-guard`: clean; no unsafe casts, `any`, dynamic lookup, raw SQL, swallowed errors, or non-null assertions were added.
- `test-guard`: clean; tests use real domain values, a boundary fake for application ports, and real guarded Prisma infrastructure for persistence behavior.

## Execution lifecycle
Completed in one bounded execution. No commit, push, deploy, install, credential/environment-file access, or non-test database action was performed. An initial manually supplied invalid database URL caused authentication failures; no database mutation occurred, and the required guarded command was rerun with the validated existing target and passed.

## Touched paths observed
The scoped status check reported only the five allowed implementation/test paths as changed; this report is the sixth allowed deliverable. Pre-existing unrelated dirty work was preserved.

## Session/resume reference
Not applicable.

## Risks
HTTP/module/DTO/OpenAPI integration remains intentionally deferred to the next approved boundary.

## Recommended next human decision
Accept this pre-HTTP recovery evidence and perform the independent quality/security review required by the governing workflow before any HTTP packet.
