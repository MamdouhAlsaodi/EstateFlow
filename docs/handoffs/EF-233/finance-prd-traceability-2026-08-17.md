# Finance PRD Traceability Matrix

**Date:** 2026-08-17
**Authorities:** `docs/PRD.md`, `docs/DEVELOPMENT_PLAN.md`, `docs/TASKS.md`
**Rule:** A task is closed against the PRD only when every P0 row mapped to that task has implementation and fresh verification evidence. A narrower accepted slice remains `PARTIAL`, even when all checks inside that slice pass.

## Finance requirements

| PRD ID | Required outcome                                                                    | Roadmap owner               | Current evidence                                                                                                                                           | Status      | Missing before PRD closure                                                                     |
| ------ | ----------------------------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------- |
| FIN-01 | Balanced journal; posted entries immutable; corrections by reversal                 | EF-231                      | Ledger domain, guarded commands, persistence, OpenAPI/client evidence                                                                                      | IMPLEMENTED | Reconcile only if later dashboard posting exposes a mismatch                                   |
| FIN-02 | Expected and realized commissions per Deal, split, due date, status, recipient      | EF-232                      | Versioned plan, commissionable snapshot, expected accrual, guarded HTTP/client/Web                                                                         | PARTIAL     | Realized/confirmed lifecycle and due/paid/cancelled behavior remain outside the accepted slice |
| FIN-03 | Create invoice/receivable, partial/full payments, overdue balances                  | EF-233                      | Draft, issue, payment, cancellation, computed aging, guarded HTTP, exact OpenAPI/generated client, Arabic Web, and full isolated unit/integration evidence | IMPLEMENTED | None inside EF-233; refunds/reversals remain explicitly outside this task                      |
| FIN-04 | Categorized office/campaign expenses, attachment metadata, approval status          | EF-234                      | No accepted implementation                                                                                                                                 | MISSING     | Entire EF-234 contract and implementation                                                      |
| FIN-05 | Cash-in/out, outstanding receivables, commissions due, margin, net result by period | EF-235                      | No accepted owner dashboard/read model                                                                                                                     | MISSING     | Entire EF-235 query/reconciliation boundary                                                    |
| FIN-06 | Link financial events to Deal, Property, Lead, Campaign, Broker, Organization       | EF-203/EF-231…EF-235/EF-401 | Organization and Deal links exist in current finance slices                                                                                                | PARTIAL     | Full dimension coverage and reconciled query evidence across expenses/dashboard/campaign work  |
| FIN-07 | Auditable CSV/PDF; no destructive edit of posted financial records                  | EF-235                      | Posted-ledger immutability exists; exports absent                                                                                                          | DEFERRED-P1 | Export contracts and formula-injection safety after query correctness                          |
| FIN-08 | Gateway/reconciliation deferred; domain remains extensible for provider references  | Later                       | Gateway intentionally absent                                                                                                                               | DEFERRED-P2 | No gateway work in MVP; do not add speculative provider behavior                               |

## EF-233 requirement decomposition

| Requirement                           | Source                          | Evidence/status                                                                                                                                                    |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Invoice draft creation                | DEVELOPMENT_PLAN EF-233; FIN-03 | IMPLEMENTED — T0–T4 and Web evidence                                                                                                                               |
| Invoice issue and one receivable      | DEVELOPMENT_PLAN EF-233; FIN-03 | IMPLEMENTED — atomic persistence and HTTP evidence                                                                                                                 |
| Partial/full payment                  | FIN-03                          | IMPLEMENTED — exact-money and overpayment tests                                                                                                                    |
| Idempotent payment recording          | DEVELOPMENT_PLAN EF-233         | IMPLEMENTED — replay and concurrent same-key evidence                                                                                                              |
| No payment gateway                    | DEVELOPMENT_PLAN EF-233         | IMPLEMENTED AS BOUNDARY — no gateway/provider behavior                                                                                                             |
| Invoice cancellation rules            | DEVELOPMENT_PLAN EF-233         | IMPLEMENTED — T5A domain/application, T5B guarded PostgreSQL persistence, T5C guarded HTTP, T5D OpenAPI/generated client, and T5E Arabic Web accepted              |
| Due date and aging / overdue balances | DEVELOPMENT_PLAN EF-233; FIN-03 | IMPLEMENTED — UTC compute-on-read classifier, tenant-scoped stable persistence query, bounded cursor/HTTP, exact OpenAPI/generated client, and Arabic Web accepted |

## Closure result

1. EF-233 cancellation and aging T5A–T5E: accepted.
2. Full isolated unit, destructive PostgreSQL integration, build, drift, and cleanup gates: passed.
3. FIN-03: `IMPLEMENTED` within the documented boundary.
4. EF-233: `CLOSED / PASS`.
5. The next unresolved finance row is still FIN-02 partial, while EF-234 owns FIN-04; do not claim all Phase 2 Finance rows complete.

## Explicit non-goals of the active reconciliation

- reminders or automation;
- gateway, bank reconciliation, refund, or payment reversal;
- accounting journal posting automation;
- exports or owner dashboard aggregation;
- modifying issued amount, currency, Deal, issue time, due time, actor, or original receivable amount;
- destructive deletion of invoices, receivables, or payments.
