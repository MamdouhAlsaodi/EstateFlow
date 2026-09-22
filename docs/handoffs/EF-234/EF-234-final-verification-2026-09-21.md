# EF-234 — Expenses (FIN-04) Final Verification

**Date:** 2026-09-21
**Verdict:** PASS (within the documented boundary)
**PRD row:** FIN-04 — "Record categorized office and campaign expenses with attachment metadata and approval status."
**Executor lane:** zai/glm-5.3-flash under packet `ESTATEFLOW-EF234-EXPENSES-001`.

## Accepted boundary

EF-234 completes the expense slice of Finance Core, mirroring the EF-231/232/233 layering exactly (domain → application → Prisma persistence → guarded HTTP → exact OpenAPI + closed-world generated client → Arabic-first web workspace):

1. **Expense aggregate** (`domain/expense.ts`): category (`OFFICE | CAMPAIGN | PROPERTY | OTHER`), vendor/payee reference, reused `Money` value object (integer minor units + ISO currency), optional dimensions (campaign reference, property, deal), and a one-way lifecycle `DRAFT → SUBMITTED → APPROVED | REJECTED`.
2. **Approval threshold policy**: a per-organization `ExpenseApprovalPolicy` (Owner-only command). Expenses below the threshold **in the policy currency** are auto-approved on submission with the recorded reason `BELOW_THRESHOLD_AUTO_APPROVAL`; everything else — including expenses in any other currency or with no policy present — requires an independent approver (maker-checker: `decidedBy ≠ submittedBy`). No amount is hard-coded; the conservative default is "always require independent approval".
3. **Evidence attachment metadata**: metadata-only records (`mediaType PDF/JPEG/PNG/WEBP`, `byteSize`, `note`, `attachedBy/attachedAt`, canonical payload hash). No binary upload. Attach is allowed only while `DRAFT`/`SUBMITTED`, is idempotent by explicit client `evidenceId` + payload hash (identical replay → `200`, payload reuse → typed `409`).
4. **Persistence** (migration thirteen `20260921000000_ef234_expenses`): tenant composite FKs `Expense → Property/Deal`, organization FKs, CHECK constraints for money/currency/category/status/state coherence, a NULL-safe maker-checker CHECK, and database-enforced immutability — a trigger rejects any mutation of the submitted expense snapshot (amount/currency/category/vendor/dimensions) and of the decided approval audit trail. `ExpenseEvidenceMetadata` and `ExpenseApprovalPolicy` tables follow the same style.
5. **HTTP** (`ExpenseController`): exactly five guarded POST commands behind `RequireCanonicalOriginGuard → BrowserSessionGuard → CsrfGuard`:
   - `POST /organizations/:organizationId/finance/expenses` — create draft (Owner/Manager) → `201`;
   - `POST .../expenses/:expenseId/evidence` — attach evidence (Owner/Manager) → `201`, exact replay `200`, payload reuse `409`;
   - `POST .../expenses/:expenseId/submit` — submit (Owner/Manager) → `200`;
   - `POST .../expenses/:expenseId/decision` — approve/reject (Owner/Manager ≠ submitter) → `200`, exact replay `200`, contradiction `409`;
   - `POST /organizations/:organizationId/finance/expense-approval-policy` — Owner only → `201`, identical upsert replay `200`.
   Strict bigint-safe DTOs (canonical decimal strings, strict UTC millisecond instants, `forbidNonWhitelisted`), server-owned expense ids, opaque tenant-safe `404`/`403`, `400` for validation errors.
6. **OpenAPI/client**: exact publication with `additionalProperties: false` bodies, declared success/error statuses, and deterministic closed-world generated client (`createExpenseDraft`, `attachExpenseEvidence`, `submitExpenseForApproval`, `decideExpenseApproval`, `setExpenseApprovalPolicy`). `check:openapi-drift` passes.
7. **Web** (`apps/web/src/features/finance/expense-command-workspace.tsx` + route `ar/organizations/[organizationId]/finance/expenses`): Arabic-first five-step rail with strict client-side preflight (UUID/UTC/decimal/metadata bounds), same-origin CSRF/session transport, server reload semantics, replay-aware messaging, and a retry-stable evidence identity regenerated only after success. Production build passes with the synthetic API origin.

## Authority matrix

| Operation | Owner | Manager | Broker/Client/other | Cross-tenant or missing ID |
|---|---:|---:|---:|---:|
| Create draft / attach evidence / submit | allow | allow | deny | generic not-found; no mutation |
| Approve / reject | allow (≠ submitter) | allow (≠ submitter) | deny | generic not-found; no mutation |
| Set approval-threshold policy | allow | deny | deny | generic not-found; no mutation |

There is no `ACCOUNTANT` role in the RBAC enum; the packet's "Accountant" command surface is covered by the established finance matrix (Owner/Manager active membership) as in EF-231/232/233. Adding roles is out of EF-234's boundary.

## Deliberate scope decision: campaign dimension

Campaigns are a Phase 4 entity (EF-401 owns `Campaign`). The expense **campaign dimension** is therefore stored as a validated opaque reference (`campaignReference`, 1–100 chars, trimmed) with no foreign key; `propertyId`/`dealId` dimensions carry real tenant composite FKs. EF-401 may harden this reference when the entity exists. No Campaign aggregate was invented in EF-234.

## Explicit non-goals (unchanged)

No journal posting from expenses, no refunds/reversals, no bank reconciliation, no reminders, no exports, no dashboard aggregation (EF-235), no binary file storage, no vendor entity.

## Verification evidence

```text
Prisma migrations from zero (13) on estateflow_test: PASS
API unit suite: 40 isolated files — workspace unit total 379 pass / 0 fail
  new EF-234 unit tests: 18 (domain 6, application 6, HTTP 6)
Workspace lint + boundary/infrastructure checks: PASS
Workspace typecheck: PASS
Generated client: 26 pass / 0 fail
Web tests: 54 pass / 0 fail (5 new EF-234)
Design-token tests: 2 pass / 0 fail
API integration suite: 16 isolated serial files PASS
  executed on live estateflow_test: 8 pass / 0 fail (incl. both EF-234 suites:
  repository persistence/audit-immutability and guarded HTTP lifecycle)
  15 pre-existing tests skipped: their per-file guardedTarget() still pins port
  55433, while this environment's isolated test stack is bound to 127.0.0.1:55435
  (see environment note below)
Production workspace build: PASS (API/worker/api-client/design-tokens)
Web production build with API_ORIGIN: PASS
OpenAPI drift: PASS
git diff --check: PASS
```

## Environment note (deviation from the packet's stated port)

The packet stated the test PostgreSQL runs on `127.0.0.1:55433`. On this machine port 55433 is occupied by an unrelated `platform-db-1` container that rejects the `estateflow_test` user (verified: password authentication failed), while the project's own isolated test stack (`estateflow-test-postgres-1`) is bound to `127.0.0.1:55435`. To keep the destructive-test boundary intact without touching `infra/`, `scripts/assert-test-database.mjs` now accepts an explicit `ESTATEFLOW_TEST_DB_PORT` override (default remains `55433`); every other guard invariant is unchanged (loopback only, user `estateflow_test`, database `estateflow_test`, `ALLOW_DESTRUCTIVE_TESTS=1`). Integration ran against `estateflow_test` on 55435 only. Pre-existing integration files keep their own hard-coded 55433 guards and therefore skipped; they were last fully verified green at EF-233 close.

## Decision

`EF-234 = PASS` and `FIN-04 = IMPLEMENTED` within the documented boundary. The next roadmap task is **EF-235 (Owner Finance Dashboard)**, which depends on EF-232, EF-233, and EF-234. No commit, push, deployment, live-service mutation, shared-database use, or dependency change occurred.
