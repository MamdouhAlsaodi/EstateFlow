# Role Report — EF-231-T1-R1-LEDGER-RUNTIME-CONTRACT

## Status
PASS

## Goal
Repaired only the independently proven T1 runtime contract gaps: invalid account types, invalid accounting-period dates/ranges, and application-level cross-organization rejection before typed repository mutation ports.

## Allowed paths used
- `apps/api/src/features/finance/domain/ledger.ts`
- `apps/api/src/features/finance/application/ledger-application.ts`
- `apps/api/test/ef231-ledger.domain.test.mjs`
- `apps/api/test/ef231-ledger.application.test.mjs`
- `docs/handoffs/EF-231/T1-R1-ledger-runtime-contract-executor.md`

## Repairs
- `createAccount` now accepts only `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, or `EXPENSE` at runtime.
- `postJournalEntry` now validates finite `startsAt` and `endsAt`, then rejects `startsAt > endsAt` before comparing `postedAt` to the range.
- Preserved the predecessor's application guards for `createDraft`, `post`, and `reverse`; added coverage for entry and period organization mismatches and confirmed no repository mutation calls occur.

## TDD evidence

### RED
Command:

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.domain.test.mjs test/ef231-ledger.application.test.mjs
```

Build exited `0`. The test run exited `1` with the expected missing behavior:

- `createAccount rejects unsupported account types`: `AssertionError [ERR_ASSERTION]: Missing expected exception.`
- `unbalanced drafts and invalid periods cannot post`: `AssertionError [ERR_ASSERTION]: Missing expected exception.` for the invalid `startsAt` period-date case.
- Observed totals: `tests 13`, `pass 11`, `fail 2`.
- The cross-organization application test was already green against the preserved predecessor guards: no repository calls were made.

### GREEN
Final verification command:

```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/ef231-ledger.domain.test.mjs test/ef231-ledger.application.test.mjs && git diff --check -- apps/api/src/features/finance/domain/ledger.ts apps/api/src/features/finance/application/ledger-application.ts apps/api/test/ef231-ledger.domain.test.mjs apps/api/test/ef231-ledger.application.test.mjs docs/handoffs/EF-231/T1-R1-ledger-runtime-contract-executor.md
```

Observed:

- Build exited `0`.
- Tests exited `0`: `tests 13`, `pass 13`, `fail 0`, `cancelled 0`, `skipped 0`.
- `git diff --check` exited `0` with no output.

## Scope controls
No changes were made to `money.ts`, repository interfaces, Prisma/schema/migrations/database, HTTP/OpenAPI/Web, or unrelated finance areas. No commit, push, deploy, install, secret/environment-file access, or DB command was performed.

## Review notes
- `clean-code-guard`: clean; the repair adds one focused account-type validator and reuses the existing finite-date validator without speculative abstraction.
- `test-guard`: no blocking test-pattern findings; tests assert public behavior and repository side-effect counts at the application boundary.
