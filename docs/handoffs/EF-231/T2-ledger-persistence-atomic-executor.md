# EF-231 T2 — Ledger Persistence Atomic Executor

## Verdict

**PASS** — bounded EF-231 T2 persistence execution completed on the guarded test database.

## Implemented allowed paths

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260814000000_ef231_ledger_core/migration.sql`
- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts`
- `apps/api/test/ef231-ledger.repository.integration.test.mjs`
- This report

No domain/application/repository port, HTTP, OpenAPI, Web, or unrelated product path was edited by this packet.

## Evidence

- `node scripts/assert-test-database.mjs` — PASS; accepted only `estateflow_test` on loopback port `55433` as `estateflow_test`.
- `pnpm --dir apps/api run db:generate` — PASS.
- Guarded `pnpm --dir apps/api run db:migrate:test` — PASS; migration `20260814000000_ef231_ledger_core` deployed to the guarded test database only.
- `pnpm --dir apps/api run build` — PASS.
- Exact EF-231 integration test — PASS, 1/1.
- Relevant EF-203 repository integration test — PASS, 5/5, serial execution.
- `git diff --check` — PASS.
- `clean-code-guard` — PASS; removed an unused persistence return value and renamed a generic transaction-count variable.

The integration test verifies atomic draft persistence, exact bigint amounts and sides/currencies, organization-scoped account-code uniqueness, same-code cross-organization success, owned DRAFT-to-POSTED transition, immutable lines/repost rejection, closed and cross-organization period rejection, reversal line swapping and original immutability, database positive-amount and period-range checks, and explicit T2-table cleanup/asserted emptiness.

## Recovery note

The first guarded migration attempt exposed a PostgreSQL self-referential foreign-key ordering issue. The migration was corrected to define the composite JournalEntry uniqueness constraint before its self-reference, the failed migration was marked rolled back on the guarded test database, and the required guarded deploy then completed successfully. No non-test database action was performed.

## Dirty-work preservation

Pre-existing dirty work was preserved; no commit, push, install, deployment, credential, environment-file, or secret output operation was performed.
