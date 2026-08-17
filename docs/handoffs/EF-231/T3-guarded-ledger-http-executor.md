# EF-231 T3 Guarded Ledger HTTP Executor

## Status
BLOCKED

## Exact drift diagnostic

The accepted T2 application contract does not provide the typed domain/validation/invalid-state errors required by the T3 HTTP boundary.

Evidence from the accepted predecessor source:

- `apps/api/src/features/finance/application/ledger-application.ts` returns `Error` instances created by untyped domain calls and direct string errors, including `Only draft entries can be posted` and `Only posted entries can be reversed`.
- `apps/api/src/features/finance/domain/ledger.ts` throws bare `Error` for validation and invalid state (`Invalid account type`, invalid period/date, invalid side, unbalanced entry, closed period, immutable/posting state, and organization mismatch).
- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts` also throws bare `Error` for persistence/state failures, including `Persisted journal entry is not a valid balanced draft`, `Accounting period is invalid for organization or posting date`, and `Journal entry is not an owned draft`.

Therefore a controller cannot map **typed** domain/validation/invalid-state errors to HTTP 400 while distinguishing unexpected persistence failures. Adding message-based classification would be an unsafe contract workaround; adding typed errors requires forbidden domain/application/repository changes. Per packet instruction, this executor stopped instead of changing those layers.

## TDD RED evidence

Added the allowed static HTTP test first:

```text
apps/api/test/ef231-ledger.http.test.mjs
```

Command:

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.http.test.mjs
```

Observed expected RED:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module .../apps/api/dist/features/finance/finance.module.js
```

The build itself exited `0`; the test failed before assertions because the guarded Finance HTTP module/controller/DTO boundary does not yet exist.

## Scope and preservation

Only allowed paths were touched:

- `apps/api/test/ef231-ledger.http.test.mjs` — RED-first static contract test.
- `docs/handoffs/EF-231/T3-guarded-ledger-http-executor.md` — this report.

No Finance production source, `AppModule`, integration test, database, OpenAPI/client/Web path, schema, migration, commit, push, deploy, install, credential, or environment-file path was changed. Existing dirty work was preserved.

## Verification not run

The guarded database script and all post-implementation verification were not run because the predecessor contract drift blocks safe HTTP implementation before database use. No HTTP extras were added.

## Required unblocker

Approve a bounded predecessor recovery packet that introduces typed, transport-neutral domain/application errors (without changing the accepted ledger behavior), then rerun this exact T3 packet from RED. No T3 HTTP implementation is accepted by this report.
