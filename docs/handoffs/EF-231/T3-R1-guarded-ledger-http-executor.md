# EF-231 T3-R1 — Guarded Ledger HTTP Executor

## Status
PARTIAL

## Implemented allowed boundary

- Added `FinanceModule` and imported it from `apps/api/src/app.module.ts`.
- Added exactly the five guarded POST routes in `ledger.controller.ts`, each using `RequireCanonicalOriginGuard`, `BrowserSessionGuard`, and `CsrfGuard` in that order.
- Added UUID route pipes, strict DTO validation, canonical positive decimal `amountMinor` transforms to `bigint`, bounded draft lines, and recursive response serialization to decimal strings.
- Wired `PrismaLedgerRepository`, `LedgerApplication`, and an organization membership reader selecting only `organizationId`, `role`, and `status`.
- Added static RED-preserving HTTP contract coverage and guarded real HTTP coverage.
- No domain/application/repository/schema/migration/OpenAPI/client/Web path was changed.

## Verification evidence

### Static contract

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.http.test.mjs
```

PASS — build and `4/4` static tests passed.

### Guarded database sequence

```text
node scripts/assert-test-database.mjs
```

PASS — `estateflow_test` on loopback `127.0.0.1:55433` as `estateflow_test`.

```text
pnpm --dir apps/api run db:generate
pnpm --dir apps/api run db:migrate:test
pnpm --dir apps/api run build
```

PASS — Prisma generated, 8 migrations with no pending migrations, and API build passed.

### Guarded real HTTP

```text
pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.http.integration.test.mjs
```

PARTIAL — authorization, DTO rejection, duplicate conflict, period creation, draft creation, posting, and typed post-state `400` assertions reached successfully. The lifecycle assertion for reversal returned `500` instead of `201`.

### Regression

```text
pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef203-deal.http.integration.test.mjs
```

PASS — `1/1` passed.

### Scoped diff

```text
git diff --check -- apps/api/src/app.module.ts apps/api/src/features/finance/finance.module.ts apps/api/src/features/finance/http/ledger.dto.ts apps/api/src/features/finance/http/ledger.controller.ts apps/api/test/ef231-ledger.http.test.mjs apps/api/test/ef231-ledger.http.integration.test.mjs docs/handoffs/EF-231/T3-R1-guarded-ledger-http-executor.md
```

PASS — no whitespace errors and only the approved paths are listed by the scoped status check.

## Blocking predecessor defect

The accepted T2 application implementation constructs reversal IDs as:

```text
`${originalEntry.id}-reversal`
```

The persistence schema requires `JournalEntry.id` to be a UUID. Consequently the approved HTTP reverse command reaches an invalid UUID database error and returns `500`. Correcting this requires a change to the accepted application/core layer, which is forbidden by this packet. No message-based mapping, core edit, invented idempotency behavior, or unsafe controller workaround was added.

Required unblocker: a bounded predecessor recovery packet must replace the invalid reversal-ID construction with a valid UUID while preserving the accepted T2 behavior; then rerun this packet's guarded real HTTP integration.

## Exact deferred OpenAPI diagnostic

Command:

```text
node scripts/check-openapi-drift.mjs
```

Observed exact result: exit code `1`, with no stdout/stderr output. This is recorded as **deferred—not PASS**; no OpenAPI artifact, client, package, or Web path was changed.

No commit, push, deploy, install, credential access, environment-file access, or non-test database action was performed.
