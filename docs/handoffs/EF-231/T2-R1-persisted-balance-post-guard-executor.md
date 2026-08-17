# EF-231 T2-R1 — Persisted Balance Post Guard Executor

## Verdict

**PASS** — the EF-231 T2-R1 recovery was executed within the allowlist.

## Change

`PrismaLedgerRepository.post` now reads the organization-scoped persisted `JournalEntry` with its persisted `JournalLine` rows in the transaction before `updateMany`. It rejects absent/non-DRAFT entries, fewer than two lines, currency mismatches, non-positive amounts, and unequal bigint debit/credit totals with the domain-safe error `Persisted journal entry is not a valid balanced draft`. Rejection occurs before any entry transition, preserving DRAFT status, `postedAt`, and `periodId`.

The integration regression persists a balanced draft, makes the stored debit unbalanced, submits a forged balanced posted payload, asserts rejection, and verifies the stored entry remains unchanged. The existing valid-post, reversal, period, chart-code, and DB-constraint coverage remains in the same serial test.

## Evidence

- `node scripts/assert-test-database.mjs` — PASS; accepted only `estateflow_test` on loopback `:55433` as `estateflow_test` before DB actions.
- TDD RED: exact EF-231 test failed with `Missing expected rejection` at the forged post assertion against the predecessor implementation.
- `pnpm --dir apps/api run db:generate` — PASS.
- Guarded `pnpm --dir apps/api run db:migrate:test` — PASS; no pending migrations.
- `pnpm --dir apps/api run build` — PASS.
- Exact `ef231-ledger.repository.integration.test.mjs` — PASS, 1/1.
- Relevant serial `ef203-deal.repository.integration.test.mjs` — PASS, 5/5.
- TDD GREEN: exact EF-231 test passed after the repository repair, 1/1.
- `git diff --check` scoped to the allowed implementation/test/report paths — PASS; no whitespace errors reported.
- `test-guard` review — clean: real Prisma integration boundary, observable persisted-state assertions, and a justified EF-231 regression scenario.
- `clean-code-guard` — clean; no production-code guard findings requiring changes.

## Scope and preservation

Only these allowed paths were changed:

- `apps/api/src/features/finance/infrastructure/prisma-ledger.repository.ts`
- `apps/api/test/ef231-ledger.repository.integration.test.mjs`
- `docs/handoffs/EF-231/T2-R1-persisted-balance-post-guard-executor.md`

Predecessor files and unrelated dirty work were preserved. No schema, migration, domain, application, repository-port, HTTP, OpenAPI, web, commit, push, deploy, install, non-test DB action, credential output, or environment-file access was performed.
