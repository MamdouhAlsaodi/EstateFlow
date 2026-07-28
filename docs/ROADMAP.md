# EstateFlow — Execution Roadmap

> **Complete implementation plan:** `docs/DEVELOPMENT_PLAN.md`  
> **Requirements mapping:** `docs/REQUIREMENTS_TRACEABILITY.md`  
> Registry `phases` must mirror this plan.  
> Work proceeds automatically only inside an approved phase and stops at sensitive checkpoints.

## Roadmap

| Phase | Name | Outcome | Status | Gate |
|---:|---|---|---|---|
| 0 | Commercial Discovery & Contracts | Demo-first scope, workflow, data contracts, ADRs | done — demo-first | Mamdouh approved Training Demo scope and first vertical slice |
| 1 | Platform Foundation | Repository, CI, tenant-aware Auth/RBAC, audit/outbox, PostgreSQL/PostGIS | doing — EF-101 verified | Security and schema review |
| 2 | Sellable Operations Slice + Basic Viewings | Listings + CRM + Finance + conflict-safe Viewing workflow | planned | End-to-end demo and concurrent-booking test accepted |
| 3 | Automation & Reminders | Rule engine, scheduler, retries, reminder library, audit | planned | Delivery-channel approval |
| 4 | Content & Campaigns | Content calendar, approvals, UTM attribution, ROI | planned | External-channel credential approval |
| 5 | Advanced Viewings & Geo Discovery | Availability depth, map/radius/polygon search, performance | planned | Search-performance and advanced scheduling tests |
| 6 | Media, Contracts, Admin & i18n | Media jobs, simplified e-sign, moderation, Arabic/English | planned | Security/legal boundary review |
| 7 | Pilot Hardening & Market Launch | Production readiness, onboarding, monitoring, paid/timeboxed pilot | planned | Explicit build/release/deploy approval |

## Phase 0 — current

### Deliverables

- Source PRD preserved unchanged.
- Commercial product strategy.
- Product Requirements v1.1 emphasizing Finance, Automation, and Marketing.
- Finance/Automation and Content/Marketing contracts.
- Architecture proposals and domain boundaries.
- First-customer interview script.
- Approved Phase 1 packet.

### Definition of done

- At least five interviews, or one named office accepts a pilot, or Mamdouh approves a demo-first timebox.
- One primary workflow and one owner financial report are selected.
- Pilot price/duration hypothesis is recorded.
- First channels and data-import method are selected.
- Architecture ADRs are reviewed and Phase 1 is explicitly approved.

## Phase 1 — platform foundation

### Outcome

A secure, organization-aware modular monolith with migration discipline, observability, audit events, transactional outbox, and documented API conventions.

### Acceptance

- Mandatory-secret startup failure in production.
- Backend role/ownership enforcement tests.
- Organization isolation tests.
- CI executes lint, typecheck, unit/integration tests, and security checks.
- No business UI beyond foundation needs.

## Phase 2 — sellable operations slice

### Outcome

A real demo from listing/Lead to conflict-safe Viewing, closed deal, commission, receivable/payment, and owner report.

### Acceptance

- Lead has owner, stage, next action, and timeline.
- Balanced ledger posting and immutable corrections.
- Partial payment and overdue balance work.
- Broker commission calculation is traceable and maker-checker applies when configured.
- Closed-period reopening is restricted, reasoned, audited, and independently reviewed before Pilot.
- Basic Viewing lifecycle works and the database rejects overlapping confirmed slots under parallel requests.
- Owner dashboard reconciles to underlying entries.

## Phase 3 — automation and reminders

### Outcome

Durable automations for Lead SLA, viewings, receivables, commissions, and internal escalation.

### Acceptance

- Idempotent jobs and no duplicate external send.
- Visible retries/failures.
- Timezone-safe 24h/1h viewing reminders.
- Full audit and manual override.

## Phase 4 — content and campaigns

### Outcome

Approved listing data becomes controlled content drafts and measurable campaigns.

### Acceptance

- No invented property facts.
- Human approval before external publication.
- UTM data captured into Lead timeline.
- CPL/CAC/ROI report handles incomplete data honestly.

## Phase 5 — advanced viewings and geo discovery

### Outcome

The basic Phase 2 Viewing workflow expands into broker availability depth, mobile-friendly property discovery, geo performance, and richer scheduling automation.

### Acceptance

- Existing no-overlap constraint remains green under regression and load tests.
- Agreed P95 geo-search target is met on representative data.

## Phase 6 — media, contracts, admin, and i18n

### Outcome

Heavy media jobs, simplified contract signing/audit, admin workflows, and complete RTL/LTR.

### Acceptance

- Media requests return without waiting for processing.
- Retries and failed jobs are visible.
- Contract hash and signature audit are append-only.
- Authorization and critical modules meet coverage target.

## Phase 7 — pilot and launch

### Outcome

A monitored, backed-up, documented deployment operated by one real office.

### Acceptance

- Onboarding and data-import checklist completed.
- Health, queue, backup, restore, and incident checks exercised.
- Pilot metrics captured weekly.
- Mamdouh explicitly approves production release.

## Global stop conditions

Autopilot pauses for:

- Secrets or external credentials.
- Network/public-access changes.
- Destructive data operations or migrations with irreversible risk.
- Architecture changes affecting the shared MamtrexS kernel.
- Paid service commitments.
- Build/release/deploy.
