# EF-231 T2-R6 — Typed Ledger Errors Executor

## Status
PASS

## Goal
Replaced ledger bare `Error` failures with transport-neutral typed validation/state errors without adding HTTP, schema, or persistence behavior changes.

## Allowed paths used
- `apps/api/src/features/finance/domain/money.ts`
- `apps/api/src/features/finance/domain/ledger.ts`
- `apps/api/src/features/finance/application/ledger-application.ts`
- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts`
- `apps/api/test/ef231-ledger.domain.test.mjs`
- `apps/api/test/ef231-ledger.application.test.mjs`
- `apps/api/test/ef231-ledger.repository.integration.test.mjs`
- `docs/handoffs/EF-231/T2-R6-typed-ledger-errors-executor.md`

## Implementation
- Exported `LedgerValidationError` and `LedgerStateError` with stable `code` identity.
- Preserved `MoneyValidationError` as a `LedgerValidationError` subtype.
- Domain malformed values and balance/shape failures use `LedgerValidationError`.
- Domain lifecycle/period-state and reversal guards use `LedgerStateError`.
- Application non-draft post and non-posted reverse guards use `LedgerStateError`; access-denied and not-found result unions remain unchanged.
- Repository guarded business-state failures use `LedgerStateError`; Prisma/network/programming errors still propagate because no generic catch-all conversion was added.
- No HTTP/schema/module/DTO/OpenAPI/client/migration changes.

## TDD evidence
RED was run after adding typed-identity assertions and before production edits:

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.domain.test.mjs test/ef231-ledger.application.test.mjs
exit 1
SyntaxError: ... ledger.js does not provide an export named 'LedgerStateError'
```

GREEN after the minimal implementation:

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.domain.test.mjs test/ef231-ledger.application.test.mjs
19 tests, 19 pass, 0 fail
```

## Guarded persistence verification
The required database guard ran first:

```text
node scripts/assert-test-database.mjs
Destructive test database target accepted: estateflow_test on loopback:55433.
```

Then the required sequence ran:

```text
pnpm --dir apps/api run db:generate                         PASS
pnpm --dir apps/api run db:migrate:test                     PASS (no pending migrations)
pnpm --dir apps/api run build                               PASS
node --test ... ef231-ledger.repository.integration.mjs \
  ef203-deal.repository.integration.test.mjs                 6/6 PASS
```

The EF-231 integration retained forged persisted-balance rejection, no partial transition, immutable posting, period/state rejection, and reversal semantics. No non-test database was used.

## Scoped checks
- No `throw new Error` remains in the changed Finance production files.
- `git diff --check` passed for all seven changed implementation/test paths.
- No commit, push, deploy, install, credentials, or environment-file access occurred.
- Pre-existing unrelated dirty work was preserved.

## Guard passes
- `test-guard`: changed tests assert observable typed error behavior and real guarded persistence; no new mock boundary was introduced.
- `clean-code-guard`: typed classes are small and explicit; no broad error conversion, dynamic capability detection, unsafe cast, or speculative abstraction added.

## Handoff
The typed predecessor contract is ready for the separately guarded EF-231 HTTP packet. This packet itself adds no HTTP work.
