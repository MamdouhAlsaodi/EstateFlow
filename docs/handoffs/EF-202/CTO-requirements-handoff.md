# EF-202 — CTO Requirements Handoff

## Status

Read-only discovery complete. No product-source change, migration, runtime mutation, commit, push, or deployment is part of this handoff.

## Approved product outcome

An organization-scoped Lead CRM workflow: a lead can be created from a property inquiry or manually, assigned to an owner, moved through an explicit pipeline stage transition, given a next action and source/UTM context, and audited through an append-only timeline.

## Source-backed requirements

- `docs/DEVELOPMENT_PLAN.md:548-567`: inquiry/manual creation; owner, stage, next action, source/UTM, timeline; explicit stage endpoint; optimistic concurrency.
- `docs/PRD.md`: Kanban/list/detail timeline; notes, tasks, owner, due date, next action, follow-up reminder, inactivity age.
- `docs/REQUIREMENTS_TRACEABILITY.md`: CRM-01 through CRM-05; cross-org denial and timeline append behavior must be tested.

## Boundaries

### In scope for EF-202

- Lead aggregate and valid pipeline stage transitions.
- Organization-scoped CRUD/list/detail boundary.
- Manual and inquiry-origin creation contract (the inquiry adapter may be a narrow internal command until a customer inquiry feature exists).
- Owner assignment, next action, source and UTM fields.
- Append-only timeline events for create, assignment, stage and next-action changes.
- Notes and tasks with due date.
- Optimistic concurrency and idempotent command handling.
- API contract, typed client, Arabic-first Kanban/list/detail UI.

### Deferred

- Deal close commands: EF-203.
- SLA/inactivity automatic tasks and reminders: EF-303.
- Viewings: EF-501.
- Campaign attribution calculations: EF-401/405.
- Finance events: EF-203 onward.
- External messaging, real customer data, provider integrations, deployment.

## Non-negotiable invariants

1. A Lead belongs to exactly one organization; cross-org reads/mutations return denial/not-found without information leakage.
2. All command mutations require idempotency keys; a replay returns the same outcome without duplicating timeline events.
3. Versioned Lead mutations reject stale versions without overwriting newer data.
4. Timeline is append-only; direct client mutation/deletion is forbidden.
5. Stage transitions use one explicit command and a domain transition table; no generic uncontrolled PATCH of `stage`.
6. Active Leads require an owner and next action; closed semantics remain reserved for EF-203.
7. The server owns validation, authorization, timestamps and timeline facts.

## Approved pipeline decision

`NEW → CONTACTED → QUALIFIED → NURTURING`

- `CONTACTED → NEW` مسموح فقط لتصحيح الإدخال.
- `QUALIFIED → CONTACTED` و`NURTURING → CONTACTED` مسموحان لإعادة المتابعة.
- حالات `WON` و`LOST` خارج EF-202 ومؤجلة إلى EF-203.

## First execution slice proposal: EF-202 T1

**Goal:** establish the Lead domain/application contracts only, before persistence, HTTP or UI.

**Allowed paths:**
- `apps/api/src/features/leads/domain/`
- `apps/api/src/features/leads/application/`
- `apps/api/test/ef202-lead.domain.test.mjs`
- `apps/api/test/ef202-lead.application.test.mjs`
- `docs/handoffs/EF-202/`

**Forbidden:** Prisma schema/migrations, route/module wiring, web UI, external services, dependency changes, commit/push/deploy.

**Acceptance checks:** valid/invalid transitions; immutable timeline intent contract; stale-version error; idempotency contract; organization ownership input; focused RED→GREEN tests; `pnpm --dir apps/api run build`; `git diff --check`.

## Next approval required

Authorize **EF-202 T1 — Lead domain/application contracts** to create a bounded execution packet and begin implementation.
