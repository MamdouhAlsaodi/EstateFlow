# EF-302 — Durable scheduler

## Boundary

EF-302 adds durable `AutomationJob` persistence and an API-side callable scheduler. Schedule evaluation only derives due occurrences and inserts jobs; action execution separately claims due jobs and invokes an `AutomationActionPort`.

- `(organizationId, executionKey)` is unique, with deterministic SHA-256 keys over organization/rule/version/event/action/target/schedule bucket.
- Concurrent due claims use `FOR UPDATE SKIP LOCKED` and bounded attempts.
- Retry delays are `30s, 60s, 120s, 240s, 480s...`, capped at one hour; exhausted jobs become `FAILED` with typed, bounded last-error fields.
- Failed jobs are queryable through typed organization-scoped scheduler methods.
- Daily schedule buckets are part of the execution key, so repeated ticks enqueue each due occurrence at most once.

## Runner decision

`apps/worker` is present but empty. This packet intentionally does not add a long-lived loop or deployment infrastructure. `AutomationScheduler.evaluateScheduleTriggers` and `runDueJobs` are callable API-side entry points. EF-303 must provide the worker loop, concrete action executors, and any queue/outbox adapter wiring.

## Verification boundary

No external provider or side effect is implemented here. Until EF-303 registers executors, the API module records a typed `action-executor-not-configured` failure rather than silently dropping a job.
