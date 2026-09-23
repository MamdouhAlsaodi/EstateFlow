# EstateFlow — Requirements Traceability Matrix

**Purpose:** Ensure every accepted PRD requirement maps to an implementation task, verification evidence, and release target.

Status legend:

- `MVP` — Portfolio MVP.
- `PILOT` — required before real-office pilot.
- `LATER` — consciously deferred.

## Identity and tenancy

| Requirement                                                  | Tasks                  | Evidence                                                   | Target    |
| ------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------- | --------- |
| AUTH-01 registration, verification, reset, rotation, lockout | EF-120                 | API integration + session lifecycle E2E + rate-limit tests | MVP       |
| AUTH-02 roles and broker approval                            | EF-121, EF-620         | permission matrix + admin flow E2E                         | MVP       |
| AUTH-03 organization ownership and IDOR prevention           | EF-121, EF-701         | cross-tenant repository/API tests                          | MVP/PILOT |
| AUTH-04 Google OAuth                                         | productization backlog | provider integration/security tests                        | LATER     |

## CRM and deals

| Requirement                                      | Tasks                          | Evidence                                  | Target |
| ------------------------------------------------ | ------------------------------ | ----------------------------------------- | ------ |
| CRM-01 automatic/manual Lead creation            | EF-202, EF-303                 | inquiry-to-Lead and manual-create API/E2E | MVP    |
| CRM-02 pipeline states                           | EF-202, EF-203                 | state-machine transition tests            | MVP    |
| CRM-03 Kanban/list and append-only timeline      | EF-202                         | API + UI + concurrent update tests        | MVP    |
| CRM-04 notes/tasks/next action/reminder          | EF-202, EF-303                 | use-case + Lead detail E2E                | MVP    |
| CRM-05 link property/viewing/deal/finance events | EF-202, EF-203, EF-235, EF-501 | timeline projection/reconciliation tests  | MVP    |
| CRM-06 source/campaign/UTM                       | EF-401                         | attribution API/E2E                       | MVP    |

## Finance

| Requirement                                                 | Tasks                  | Evidence                                                                                                                                                                                                                                                                                                              | Target    |
| ----------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| FIN-01 balanced immutable ledger/reversal/period governance | EF-231                 | property-based balance + immutability + reversal + closed-period/reopen audit tests                                                                                                                                                                                                                                   | MVP/PILOT |
| FIN-02 commissions/splits/due states/maker-checker          | EF-232                 | rounding/state/idempotency/approval-threshold tests                                                                                                                                                                                                                                                                   | MVP       |
| FIN-03 invoices/receivables/partial payments                | EF-233                 | balance/aging/duplicate-payment tests                                                                                                                                                                                                                                                                                 | MVP       |
| FIN-04 expenses and evidence metadata                       | EF-234                 | authorization/approval/persistence tests — implemented: `docs/handoffs/EF-234/EF-234-final-verification-2026-09-21.md` (guarded Owner/Manager commands, maker-checker approval threshold policy, evidence metadata idempotency, immutable approval audit on PostgreSQL)                                               | MVP       |
| FIN-05 cashflow, receivables, margin/result                 | EF-235                 | report-to-ledger reconciliation — implemented: `docs/handoffs/EF-235/EF-235-implementation-2026-09-23.md` (Owner-only read-only reports, freshness timestamp on every payload, per-figure drill-down, seeded reconciliation test proves every figure equals the exact sum of source rows incl. a cancellation period) | MVP       |
| FIN-06 financial dimensions                                 | EF-231–EF-235, EF-401  | filtered report/tenant tests — partial: EF-235 ships by-deal and by-property revenue/margin reporting with tenant-isolation proof; Lead/Broker/Campaign dimensions arrive fully with EF-401                                                                                                                           | MVP       |
| FIN-07 CSV/PDF export and no destructive edits              | EF-235, EF-701         | export structure/formula protection/audit                                                                                                                                                                                                                                                                             | PILOT     |
| FIN-08 future provider references                           | EF-233 domain contract | migration/compatibility review                                                                                                                                                                                                                                                                                        | LATER     |

## Automation and reminders

| Requirement                                        | Tasks          | Evidence                                                                                                                                                                                                                             | Target    |
| -------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| AUTO-01 Trigger → Conditions → Actions             | EF-301         | rule parsing/policy tests                                                                                                                                                                                                            | MVP       |
| AUTO-02 durable jobs/idempotency/retry/dead letter | EF-302, EF-303 | durable scheduler, API-owned tick, thin worker loop, capped backoff, graceful-stop unit tests, and PostgreSQL replay proof                                                                                                           | MVP       |
| AUTO-03 viewing reminders 24h/1h                   | EF-502         | fake-clock/timezone/reschedule tests                                                                                                                                                                                                 | MVP       |
| AUTO-04 Lead inactivity/escalation                 | EF-303         | deterministic SLA/inactivity occurrence detection, API executors, worker-loop tests, and PostgreSQL Lead breach execution proof                                                                                                      | MVP       |
| AUTO-05 receivable/commission reminders            | EF-304         | deterministic due/overdue/commission occurrence/reset tests, durable notification replay proof, tenant isolation, and worker-path integration                                                                                        | MVP       |
| AUTO-06 post-viewing follow-up and suggested stage | EF-502         | viewing-outcome integration test                                                                                                                                                                                                     | MVP       |
| AUTO-07 outbound lifecycle and audit               | EF-305, EF-306 | EF-305: immutable bilingual template versions, Owner/Manager approval gate, audited approve/deny/send/suppression transitions, provider port, quiet-hours/consent policy, and worker replay proof; EF-306 owns broader automation UI | MVP/PILOT |

### EF-301/302 automation-library traceability

| AUT row                     | Current boundary                                                                                                                                                                            | Evidence                                                                           |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| AUT-L01 / AUT-L02           | Lead-created, assignment-change, response-SLA, and inactivity rules use concrete task/note/notification executors with deterministic breach occurrence keys and API-owned worker execution. | `docs/handoffs/EF-303/implementation.md`                                           |
| AUT-V01 / AUT-V02           | Rule definitions and daily occurrence deduplication are available; Viewing domain triggers/executors remain EF-502.                                                                         | `docs/handoffs/EF-301/implementation.md`; `docs/handoffs/EF-302/implementation.md` |
| AUT-F01 / AUT-F02 / AUT-C01 | Versioned receivable due-soon/overdue and commission-due rules, deterministic state-reset occurrences, durable in-app execution, and API-owned worker sweep.                                | `docs/handoffs/EF-304/implementation.md`                                           |
| AUT-M01 / AUT-M02 / AUT-M03 | Outside EF-301/302; content/campaign rules remain EF-402–EF-405.                                                                                                                            | Explicit deferral; no implementation claimed                                       |

## Content and marketing

| Requirement                               | Tasks          | Evidence                                          | Target    |
| ----------------------------------------- | -------------- | ------------------------------------------------- | --------- |
| MKT-01 content calendar/status lifecycle  | EF-402         | state machine + calendar UI tests                 | MVP       |
| MKT-02 verified listing-to-content drafts | EF-403         | allowlist/no-invention tests                      | MVP       |
| MKT-03 approval before external post      | EF-402, EF-404 | unauthorized publish rejection                    | MVP/PILOT |
| MKT-04 campaigns, budgets, UTM            | EF-401         | campaign API/UI tests                             | MVP       |
| MKT-05 Leads/wins/revenue/CPL/CAC/ROI     | EF-405         | attribution/reconciliation/zero-denominator tests | MVP       |
| MKT-06 isolated channel adapters          | EF-404         | adapter contract/provider sandbox tests           | PILOT     |
| MKT-07 manual then API performance        | EF-401, EF-404 | manual evidence + provider sync tests             | MVP/PILOT |

## Listings, geo, viewings, contracts, admin and i18n

| Requirement group                                 | Tasks          | Evidence                                                                                                                                | Target                      |
| ------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| Listing CRUD/status/moderation                    | EF-201, EF-620 | authorization/state/API/E2E                                                                                                             | MVP                         |
| Image upload validation                           | EF-201, EF-601 | MIME/signature/size/storage tests                                                                                                       | MVP/PILOT                   |
| Async video/media processing                      | EF-601         | queue/retry/non-blocking HTTP tests                                                                                                     | LATER unless pilot requires |
| Radius/polygon/filter/map discovery               | EF-510         | PostGIS correctness/explain/P95                                                                                                         | MVP                         |
| Database-enforced viewing conflicts               | EF-501         | parallel booking race test                                                                                                              | MVP                         |
| Viewing reminders/outcomes                        | EF-502         | schedule/cancel/outcome tests                                                                                                           | MVP                         |
| Simplified contract generation/signing/hash/audit | EF-610         | snapshot/hash/order/immutability tests                                                                                                  | PILOT                       |
| Admin broker/listing/job moderation               | EF-620         | privileged-transition tests                                                                                                             | MVP/PILOT                   |
| Real-time/in-app notification and fallback        | EF-305         | durable in-app fake delivery, template rendering, suppression reason persistence, provider-port boundary, and worker replay integration | MVP/PILOT                   |
| Arabic/English and RTL/LTR                        | EF-630         | missing-key/visual/accessibility/PDF tests                                                                                              | MVP/PILOT                   |

## Non-functional requirements

| Requirement                                              | Tasks/Gate                             | Evidence                                                                        | Target    |
| -------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- | --------- |
| PostgreSQL/PostGIS                                       | EF-102–EF-104, EF-510                  | migrations + integration + explain plan                                         | MVP       |
| Production fails on missing secrets                      | EF-103, EF-701                         | startup configuration tests                                                     | MVP/PILOT |
| Rate limits on sensitive endpoints                       | EF-120, EF-404, EF-501, EF-601, EF-701 | threshold/rejection tests                                                       | MVP/PILOT |
| Observable/retryable queues                              | EF-302, EF-701                         | metrics + retry/dead-letter evidence                                            | MVP       |
| Geo P95 under 400 ms on agreed dataset                   | EF-510                                 | benchmark report                                                                | MVP/PILOT |
| Zero double-booking under concurrency                    | EF-501                                 | database race test                                                              | MVP       |
| ≥70% critical-module coverage                            | all critical phases                    | per-module branch/behavior report                                               | PILOT     |
| Generated OpenAPI remains current                        | EF-106                                 | contract drift CI                                                               | MVP       |
| No committed secrets/customer data                       | EF-107, EF-701                         | tracked/untracked secret audit                                                  | all gates |
| PII redaction and privacy-by-reporting                   | EF-103, EF-235, EF-701                 | log capture tests + default export redaction + audited setting change           | MVP/PILOT |
| Pilot privacy/legal readiness                            | Phase 0, EF-701–EF-703                 | data inventory + retention/deletion/exit policy + qualified local review record | PILOT     |
| Approved content hash/config revalidation before publish | EF-402–EF-404                          | changed-content/channel/schedule rejection tests                                | MVP/PILOT |
| WCAG-aware responsive Arabic UI                          | EF-105, EF-630                         | axe/keyboard/visual tests                                                       | MVP       |
| Backup/restore and migration readiness                   | EF-702                                 | exercised restore/migration report                                              | PILOT     |

## Commercial success metrics

| Metric                                                                    | Captured by                 | Evidence                        |
| ------------------------------------------------------------------------- | --------------------------- | ------------------------------- |
| One paid/timeboxed pilot                                                  | Phase 0/7 commercial record | accepted pilot scope            |
| 100% active Leads have owner/next action or closed state                  | EF-202, EF-303              | owner weekly report             |
| No missed viewing caused by absent system reminder                        | EF-502                      | execution/delivery audit        |
| All pilot deals/commissions represented in ledger                         | EF-232, EF-235              | reconciliation report           |
| Campaign source known for ≥80% of new Leads                               | EF-401, EF-405              | attribution completeness report |
| One listing completes draft → approved → published flow                   | EF-402–EF-404               | content/publishing audit        |
| Owner answers cash/receivables/commissions/spend/wins without spreadsheet | EF-235, EF-405              | usability/pilot acceptance      |

## Change control

When a requirement changes:

1. Update `docs/PRD.md` and assign/version the requirement ID.
2. Update this matrix.
3. Update `docs/TASKS.md` and the relevant phase in `docs/DEVELOPMENT_PLAN.md`.
4. Record consequential change in `docs/DECISIONS.md`.
5. Do not mark a requirement complete until the listed evidence exists and is independently verified.
