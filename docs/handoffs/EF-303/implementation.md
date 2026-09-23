# EF-303 — Lead SLA and inactivity automations

## Boundary and verdict

EF-303 is **PASS** within the R3 packet boundary. Lead SLA/inactivity occurrence detection, versioned tenant-scoped rules, concrete Lead task/note/notification executors, the API-owned EF-302 tick, and the long-lived `apps/worker` runner are implemented. No public HTTP route was added.

## Worker wiring

- `apps/api/src/features/automation/application/automation-scheduler.ts` exposes `runTick`, which evaluates due schedule rules and claims/executes due jobs through the API action port.
- `apps/api/src/features/automation/application/automation-worker-tick.ts` is the internal API-owned runtime adapter. It creates the Nest application context and exposes only the scheduler tick plus close operation.
- `apps/worker/src/index.ts` is a thin long-lived entrypoint. It dynamically consumes the API tick, uses `scripts/automation-worker-loop.mjs`, polls immediately, prevents overlap, applies capped exponential error backoff, and stops gracefully on SIGINT/SIGTERM.
- `apps/worker/test/automation-worker-loop.test.mjs` covers immediate start, backoff reset/cap, graceful stop, and scheduler batch wiring.
- `apps/worker/test/worker.integration.test.mjs` proves a due Lead response-SLA breach job executes one task exactly once through the API tick/worker loop on PostgreSQL at loopback:55435.

Lead executors remain in `apps/api/src/features/automation/application/lead-automation-executor.ts`; the worker does not duplicate domain or persistence behavior.

## Implemented API/web boundary

- `apps/api/src/features/automation/domain/lead-automation.ts`
  - response-SLA and inactivity detection
  - assignment/change event IDs
  - reset semantics based on accepted Lead version
  - Arabic-first starter rule definitions
- `apps/api/src/features/automation/application/lead-automation-coordinator.ts`
  - tenant-scoped lifecycle scheduling and paginated breach sweeps
- `apps/api/src/features/automation/application/lead-automation-executor.ts`
  - idempotent Lead task/note persistence through the existing repository
  - fake-delivery-compatible internal notification port
- `apps/api/src/features/leads/http/lead.controller.ts`
  - publishes committed create/stage/assignment lifecycle events without turning scheduling failure into a CRM 500
- `apps/web/src/app/ar/organizations/[organizationId]/automation/page.tsx`
  - Arabic-first rules/failures visibility page; no editor UI

## Idempotency and tenancy

- Breach event IDs hash organization, Lead, breach type, and current Lead version. Replaying a sweep for the same version produces the same event/job; an accepted Lead mutation advances the reset version.
- EF-302 derives the durable job key from organization/rule/version/event/action/target. Lead task and note executors additionally use `automation:<executionKey>` as the existing Lead command idempotency key.
- Concurrent claims use the durable repository's `SKIP LOCKED` path. Rule reads, job reads, and Lead writes remain organization-scoped.
- Existing Lead persistence records append-only timeline events for automation-created tasks/notes.

## Verification boundary

No public route, OpenAPI inventory, dependency, migration, environment-file, infrastructure, commit, push, deployment, or shared database change was made in R3. EF-304 remains the next product task.
