# EF-231 T2-R2 — Period Creation Contract Executor

## Status
PASS

## Scope
Recovered only the typed accounting-period creation prerequisite. Existing accepted EF-231 domain, application, persistence, and guarded integration work was preserved. No HTTP, module, DTO, OpenAPI, Web, schema, migration, journal-posting, reversal, or unrelated finance work was added.

## Implemented

- `apps/api/src/features/finance/domain/ledger.ts`
  - Added `createAccountingPeriod` and typed `AccountingPeriodInput`.
  - Validates finite dates and `startsAt <= endsAt`; returns a frozen `OPEN` period with no caller-selected status.
- `apps/api/src/features/finance/application/ledger-repository.ts`
  - Added mandatory typed `createAccountingPeriod` port.
  - Added discriminated `created` / domain-safe `conflict` result; conflict reason documents period ownership or id collision.
- `apps/api/src/features/finance/application/ledger-application.ts`
  - Added authorized `createAccountingPeriod` application command.
  - Uses the domain factory and rejects unverified, inactive, BROKER, CLIENT, and cross-organization calls before repository mutation.
- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts`
  - Persists exactly one organization-scoped `OPEN` period through Prisma.
  - Maps Prisma `P2002`/`P2003` ownership or constraint conflicts to the typed conflict result; other errors propagate.
- Tests cover the domain/application contract and guarded persistence behavior.

## TDD evidence

1. RED: after adding domain/application tests first, the exact tests failed because `dist/.../ledger.js` did not export `createAccountingPeriod`.
2. GREEN: after the minimal implementation, exact domain/application tests passed: **19/19**.

## Verification evidence

- `node scripts/assert-test-database.mjs` — PASS; accepted only `estateflow_test` on loopback `55433` as `estateflow_test`.
- `pnpm --dir apps/api run db:generate` — PASS.
- Guarded `pnpm --dir apps/api run db:migrate:test` — PASS; no pending migrations.
- `pnpm --dir apps/api run build` — PASS.
- Exact domain/application tests — PASS, **19/19**.
- Guarded EF-231 repository integration — PASS, **1/1**; verifies exact `OPEN` row persistence, organization isolation, duplicate/ownership conflict mapping, invalid range rejection, and clean tables.
- Relevant serial EF-203 repository integration — PASS, **5/5**.
- Scoped `git diff --check` — PASS; no whitespace errors.

## Guard review

`clean-code-guard`: clean. No production-code findings requiring changes. No unsafe casts, `any`, dynamic port detection, raw SQL, non-null assertions, swallowed errors, or new dependencies were introduced.

## Preservation and restrictions

No commit, push, deploy, install, non-test database action, credential output, or environment-file access was performed. Pre-existing dirty work outside the packet allowlist was preserved.
