# Runbook

## Local operations

1. Verify the project root with `pwd`; it must equal
   `/home/server/projects/estateflow`.
2. Open the registry entry for `estateflow` to confirm phases and
   pending decisions are current.
3. Edit `docs/PLAN.md` and the registry `phases` array when a
   phase changes status.

## Worker tick observability (EF-702, local console JSON only)

The automation worker (`apps/worker`) emits one structured JSON log line per
lifecycle tick, using the same console JSON convention as the API request
log: success events go to **stdout** (via `console.info`), failure events go
to **stderr** (via `console.error`).

- Success: `{"event":"worker_tick_completed","durationMs":<int>,"schedules":{...},"jobs":{...},"deliveries":{...},"media":{...}}`
  — `durationMs` is a nonnegative integer; counter groups appear only when the
  scheduler returned an object for that group, and only allowlisted
  nonnegative safe-integer counters are serialized
  (`schedules`: evaluatedRules/scheduled/alreadyScheduled; `jobs`:
  claimed/succeeded/retried/failed; `deliveries`:
  claimed/delivered/retried/failed/cancelled; `media`:
  marked/swept/deletedStorageKeys). Unknown scheduler fields are never logged.
- Failure: `{"event":"worker_tick_failed","code":"TICK_FAILED","backoffMs":<int>}`
  — no raw error message, stack, name, or identifiers are emitted. The capped
  exponential backoff and no-overlap/stop semantics are unchanged.
- Injection: `logger.info`/`logger.error` may be injected; they default to
  `console`. Missing methods are skipped, and a throwing logger is isolated
  so it never affects tick outcome classification, backoff, or stop
  semantics.

This is local console JSON only (stdout for success, stderr for failure).
**No metrics service, alerting, dashboards, or production observability are
implemented** in this slice.

## Incident playbook

- **Registry drift**: the directory exists but the registry does
  not list the project. Do NOT create a second entry — reconcile
  by re-reading the document set under `docs/` first.
- **Stale phase state**: cross-check the latest handoff in
  `docs/handoffs/`. The handoff is the source of truth.
- **Suspected unsafe state**: stop, do not delete files, and
  consult the operator before any cleanup.
