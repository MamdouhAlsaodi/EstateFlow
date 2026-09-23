# EF-235 — Owner Finance Dashboard (FIN-05) — Implementation Evidence

Date: 2026-09-23
Executor: zai/glm-5.3-flash (bounded execution packet `ESTATEFLOW-EF235-OWNER-DASHBOARD-001`)
Baseline: `main` at `21e0ac4` (EF-234 merged), clean tree.

## Scope delivered

EF-235 closes the Phase 2 finance reporting slice: an **Owner-only, read-only**
reporting surface composed from the existing EF-231 ledger/expense, EF-232
commission-snapshot, and EF-233 receivable/payment state. **No new mutable
finance state and no new migrations** were introduced.

Four report surfaces, each carrying a server-generated freshness timestamp
(`asOf`), plus bounded drill-downs that return the underlying rows behind any
figure:

| Surface | Endpoint (GET, Owner-only) | Semantics |
|---|---|---|
| Cash in/out | `/organizations/:orgId/finance/reports/cash-flow` | cash-in = Σ payments; cash-out = Σ `APPROVED` expenses; net per currency; optional `from`/`to` window on `recordedAt`/`decidedAt` |
| Payments drill-down | `.../finance/reports/payments` | payment rows behind cash-in and behind deal/property revenue; `dealId` XOR `propertyId` dimension filter; keyset cursor; `limit ≤ 100` |
| Expenses drill-down | `.../finance/reports/expenses` | approved-expense rows behind cash-out and deal/property costs; same bounds |
| Receivables aging | `.../finance/reports/receivables/aging` | per-(bucket, currency) count and Σ outstanding; **reuses EF-233 bucket semantics exactly** (`CURRENT`, `DAYS_1_30`, `DAYS_31_60`, `DAYS_61_90`, `DAYS_91_PLUS`) |
| Aging drill-down | `.../finance/reports/receivables/aging/items` | rows of one bucket, EF-233 ordering (`dueAt ASC, id ASC`), EF-233 cursor format |
| Commissions due/paid | `.../finance/reports/commissions` | per-currency Σ of `DUE` and `PAID` accrual snapshots, plus the persisted `EXPECTED` slice |
| Commission drill-down | `.../finance/reports/commissions/items` | accrual snapshot rows incl. split allocations; full status enum filter |
| Revenue/margin by deal and property | `.../finance/reports/performance` | revenue = Σ payments (via receivables), costs = Σ approved expenses carrying the deal/property dimension, margin = revenue − costs (signed, per currency) |

Explicitly deferred: CSV/PDF export (FIN-07 / PILOT). No Campaign aggregate
(EF-401). No new auth roles.

## Boundary decisions

1. **Reporting is a read slice inside the finance feature** (`application/`,
   `infrastructure/`, `http/` layering, files prefixed `report*`), consistent
   with EF-231–EF-234. The finance module registers the new
   `ReportController`/`ReportApplication`/`PrismaReportRepository`.
2. **Owner-only**: unlike the EF-231–234 command endpoints (Owner/Manager),
   reports require `role = "OWNER"` and `status = "ACTIVE"`; brokers, managers,
   clients, and non-members receive a uniform `403`; unauthenticated reads
   receive `401`. All queries are organization-scoped; drill-down dimension
   ids that do not exist in the tenant yield empty results (opaque, no
   existence leak).
3. **Aging semantics are EF-233's, not new.** The SQL summary renders the exact
   boundaries of the domain classifier `classifyReceivableAging`
   (`daysPastDue = ceil((asOf − dueAt)/86400s)` for `dueAt < asOf`), and the
   reconciliation test proves equivalence per row against the domain function
   itself.
4. **Commission persistence reality is respected.** The durable EF-232 boundary
   persists only `EXPECTED` accruals (database check constraint
   `CommissionAccrual_status_check CHECK (status = 'EXPECTED')`). The report
   therefore reads the persisted status column honestly: `due`/`paid` figures
   are the exact sums of `DUE`/`PAID` rows (empty today), plus the persisted
   `expected` slice. FIN-02 lifecycle persistence remains partial and is
   tracked as such; no new mutable state was invented to make the dashboard
   look complete.
5. **DTO boundary is bigint-safe** (amounts as decimal strings, signed pattern
   `^-?(0|[1-9]\d*)$` for net/margin), UTC instants, strict closed-world
   response schemas, `class-validator` query DTOs (`limit 1..100`, cursor
   charset, required-enum filters, mutually exclusive dimensions).

## Reconciliation proof (acceptance centerpiece)

`apps/api/test/ef235-report-reconciliation.repository.integration.test.mjs`
seeds a synthetic two-organization scenario on the isolated `estateflow_test`
PostgreSQL and proves, with fresh command evidence, that **every dashboard
figure equals the exact sum of its source rows**:

- 7 receivables across all five aging buckets (mid-bucket placements),
  including partial payments and a **cancelled invoice** (reversal period) that
  must appear in raw rows but in no bucket, no drill-down, and no figure.
- 4 payment rows (2 currencies) and 4 approved expenses (2 currencies, all
  dimensions) plus DRAFT/SUBMITTED/REJECTED expenses that must be excluded
  everywhere.
- 3 persisted `EXPECTED` commission accruals with 60/40 splits.

Assertions (all `deepEqual`/strict against independently computed sums over
raw source rows):

1. cash-in/cash-out per currency == Σ payment/approved-expense rows (counts included).
2. net cash == cash-in − cash-out per currency.
3. windowed cash flow == Σ in-range source rows only.
4. payment drill-down set == raw payment id set (no foreign-org rows).
5. expense drill-down set == approved-expense id set; non-approved never appear.
6. aging summary == per-row `classifyReceivableAging` grouping (bucket, currency, count, Σ outstanding).
7. every bucket drill-down == classified source rows (ids, outstanding, days past due, status, ordering) and equals the summary bucket totals.
8. commission expected/due/paid == Σ status-filtered accrual snapshots; drill-down ids == source ids with exact split allocations.
9. performance by deal == payments-per-deal + approved-expenses-per-deal (revenue, costs, margin, counts) per currency; same for properties.
10. tenant isolation: foreign organization's own figures are exact; none of its rows leak into org A.

Result: **PASS** (rerunnable with `ALLOW_DESTRUCTIVE_TESTS=1 ESTATEFLOW_TEST_DB_PORT=55435 pnpm test:integration`).

## Gates (exact totals, this tree)

- `pnpm lint` — PASS (exit 0; includes workspace + infrastructure boundary checks)
- `pnpm typecheck` — PASS (exit 0, all workspaces)
- `pnpm test` — PASS: **388/388** (0 fail; includes 8 new EF-235 application unit tests, EF-235 OpenAPI contract test, updated `openapi.test.mjs` path inventory)
- `pnpm test:integration` — PASS (exit 0): 18 API integration files; **10 ran + passed (0 fail)** incl. both EF-235 suites; 15 pre-existing skips in EF-201/202/203 files that hard-code port 55433 (this machine's stack is on 55435; unrelated to EF-235)
- `pnpm build` — PASS (API + web; `/ar/organizations/[organizationId]/finance/reports` route in production build with `API_ORIGIN=http://127.0.0.1:3000`)
- `pnpm check:openapi-drift` — PASS (exit 0; closed-world regenerated client matches publication)
- `git diff --check` — PASS (no whitespace errors)
- `pnpm exec prettier --check` on the CI-listed set — PASS

## Changed paths

- `apps/api/src/features/finance/application/report-repository.ts` (new)
- `apps/api/src/features/finance/application/report-application.ts` (new)
- `apps/api/src/features/finance/infrastructure/prisma-report.repository.ts` (new)
- `apps/api/src/features/finance/http/report.controller.ts` (new)
- `apps/api/src/features/finance/http/report.dto.ts` (new)
- `apps/api/src/features/finance/http/report.openapi.ts` (new)
- `apps/api/src/features/finance/finance.module.ts` (wiring only)
- `apps/api/test/ef235-report.application.test.mjs` (new)
- `apps/api/test/ef235-report.openapi.test.mjs` (new)
- `apps/api/test/ef235-report-reconciliation.repository.integration.test.mjs` (new)
- `apps/api/test/ef235-report.http.integration.test.mjs` (new)
- `apps/api/test/openapi.test.mjs` (path inventory extended with the 8 new report paths)
- `scripts/openapi-client-template.mjs` (closed-world report operations + typed client emission)
- `packages/api-client/openapi.json`, `packages/api-client/src/generated.ts` (regenerated)
- `apps/web/src/features/finance/owner-report-model.ts` (new, strict normalizers)
- `apps/web/src/features/finance/owner-report-api.ts` (new, GET-only adapter)
- `apps/web/src/features/finance/owner-finance-dashboard.tsx` (new, Arabic-first dashboard)
- `apps/web/src/features/finance/owner-finance-dashboard.module.css` (new)
- `apps/web/src/app/ar/organizations/[organizationId]/finance/reports/page.tsx` (new)
- `docs/TASKS.md`, `docs/REQUIREMENTS_TRACEABILITY.md`, `docs/CURRENT_HANDOFF.md`

No commits, pushes, deployments, dependency changes, `.env*` reads, shared/live
database access, or `infra/` changes occurred.
