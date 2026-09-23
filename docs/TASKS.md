# EstateFlow — Task Map

> Full architecture, phase definitions, test strategy, learning outcomes, Portfolio artifacts, and sellable-product gates live in `docs/DEVELOPMENT_PLAN.md`. Requirement-to-task coverage lives in `docs/REQUIREMENTS_TRACEABILITY.md`.

## Dependency map

```text
EF-000 Discovery
 ├─ EF-010 Commercial contracts
 ├─ EF-020 Domain boundaries
 └─ EF-030 Architecture decisions
      ↓
EF-100 Platform foundation
      ↓
EF-200 CRM + Listings basic
      ↓
EF-230 Finance Core
      ↓
EF-300 Automation Engine
      ↓
EF-400 Content + Campaigns
      ↓
EF-500 Viewings + Geo
      ↓
EF-600 Media + Contracts + Admin + i18n
      ↓
EF-700 Pilot hardening and launch
```

## Phase 0 tasks

| Task   | Deliverable                                                                        | Depends on             | Status            |
| ------ | ---------------------------------------------------------------------------------- | ---------------------- | ----------------- |
| EF-001 | Preserve original PRD and create v1.1 product amendment                            | —                      | done              |
| EF-002 | Define custom-first commercial strategy                                            | EF-001                 | done              |
| EF-003 | Finance Core and automation contract                                               | EF-001                 | done              |
| EF-004 | Content/campaign automation contract                                               | EF-001                 | done              |
| EF-005 | Interview five target offices, identify one pilot, or approve a demo-first timebox | EF-002                 | done — demo-first |
| EF-006 | Select demo workflow, owner report, channels, and data import                      | EF-005                 | done              |
| EF-007 | Approve architecture ADRs and Phase 1 scope                                        | EF-003, EF-004, EF-006 | done              |

## Phase 1 tasks

| Task   | Deliverable                                                                                        | Depends on                                     | Status                                                                   |
| ------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| EF-101 | Monorepo/workspace and tooling foundation                                                          | EF-007                                         | done                                                                     |
| EF-102 | Local/test infrastructure: isolated PostgreSQL/PostGIS, Redis, and safe test-database boundary     | EF-101                                         | done                                                                     |
| EF-103 | API bootstrap, configuration validation, health endpoints, error model, and observability baseline | EF-101, EF-102                                 | done                                                                     |
| EF-104 | Prisma/PostGIS migration baseline and integration-test harness                                     | EF-102, EF-103                                 | done                                                                     |
| EF-105 | Arabic-first web shell and design-system foundation                                                | EF-101                                         | done                                                                     |
| EF-106 | OpenAPI generation, typed API client, and contract-drift check                                     | EF-103                                         | done — independently verified after EF-106-C1 correction                 |
| EF-107 | CI and quality gates                                                                               | EF-101, EF-102, EF-103, EF-104, EF-105, EF-106 | done — local workflow contract independently verified; no remote run yet |

## Phase 2 tasks

| Task   | Deliverable                                                                      | Depends on             |
| ------ | -------------------------------------------------------------------------------- | ---------------------- |
| EF-120 | Authentication domain: credentials, sessions, recovery, lockout, and rate limits | EF-103, EF-104         |
| EF-121 | Organization membership, RBAC, ownership policy, and cross-tenant denial         | EF-120, EF-104         |
| EF-201 | Basic Property/Listing workflow                                                  | EF-121, EF-104         |
| EF-202 | Lead pipeline, timeline, notes, tasks, next action                               | EF-121, EF-104         |
| EF-203 | Deal and closed-won/lost workflow                                                | EF-202                 |
| EF-231 | Chart of accounts and balanced journal posting                                   | EF-104                 |
| EF-232 | Commission plan/accrual/payable workflow                                         | EF-203, EF-231         |
| EF-233 | Invoice, receivable, partial payment, overdue status                             | EF-231                 |
| EF-234 | Expense and campaign/property/deal dimensions                                    | EF-231                 | done — FIN-04 expenses implemented (see `docs/handoffs/EF-234/`)                                              |
| EF-235 | Owner finance dashboard and export                                               | EF-232, EF-233, EF-234 | done — FIN-05 owner dashboard implemented, read-only, export deferred to FIN-07 (see `docs/handoffs/EF-235/`) |

## Phase 3 tasks

| Task   | Deliverable                                                  | Depends on             |
| ------ | ------------------------------------------------------------ | ---------------------- |
| EF-301 | Versioned Trigger/Condition/Action rule model                | EF-104                 | done — API-side versioned rules and guarded lifecycle                                                                                                                                            |
| EF-302 | Scheduler, idempotency, retry/backoff, failed-job visibility | EF-301, EF-104         | done — durable API-side callable scheduler                                                                                                                                                       |
| EF-303 | Lead SLA and inactivity automations                          | EF-202, EF-302         | done — Lead rules/executors, breach idempotency, Arabic visibility, API tick, thin worker loop, unit and PostgreSQL replay proof (see `docs/handoffs/EF-303/implementation.md`)                  |
| EF-304 | Receivable and commission reminders                          | EF-232, EF-233, EF-302 | done — versioned finance rules, deterministic reset-safe occurrences, durable in-app notifications, API-owned worker sweep, and Arabic visibility (see `docs/handoffs/EF-304/implementation.md`) |
| EF-305 | Approval policy and notification templates                   | EF-302                 |

## Phase 4 tasks

| Task   | Deliverable                                     | Depends on     |
| ------ | ----------------------------------------------- | -------------- |
| EF-401 | Campaigns, budgets, UTM and attribution touches | EF-202, EF-234 |
| EF-402 | Content calendar and approval/version workflow  | EF-201, EF-305 |
| EF-403 | Listing-to-content safe draft generator         | EF-402         |
| EF-404 | Manual/share-ready publishing adapter           | EF-403         |
| EF-405 | Campaign performance, CPL, CAC and ROI          | EF-235, EF-401 |

## Later tasks

| Task   | Deliverable                                              | Depends on                |
| ------ | -------------------------------------------------------- | ------------------------- |
| EF-501 | Viewing availability and DB exclusion constraint         | EF-201, EF-202, EF-104    |
| EF-502 | Viewing reminders and outcome automation                 | EF-501, EF-302            |
| EF-510 | Geo search, filters, radius/polygon, clustering          | EF-201, EF-104            |
| EF-601 | Async media worker and processing states                 | EF-201, EF-302            |
| EF-610 | Contract generation, sequential signing, immutable audit | EF-203, EF-104            |
| EF-620 | Admin moderation and broker approval                     | EF-121, EF-201            |
| EF-630 | Arabic/English and complete RTL/LTR                      | all UI modules            |
| EF-701 | Security/performance/recovery verification               | all MVP modules           |
| EF-702 | Pilot onboarding, import, training, and weekly report    | EF-701                    |
| EF-703 | Explicit production deployment                           | EF-702 + Mamdouh approval |

## Task packet rule

Before implementation, each task receives an English task packet containing:

- `task_id`
- Exact symbols/files allowed.
- Input contracts and dependencies.
- Tests written first where behavior is isolated.
- Forbidden actions: no push, deployment, secrets, unrelated refactor, or live-data mutation.
- Canonical handoff under `docs/handoffs/<task-id>/`.
- Independent verification evidence before completion.
