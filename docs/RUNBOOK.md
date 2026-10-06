# Runbook

## Local operations

1. Verify the checkout is a repository: `git rev-parse --show-toplevel`
   (repo root) and `git branch --show-current` (expected branch). Do not
   rely on any literal project path recorded in docs.
2. Read `docs/DEVELOPMENT_PLAN.md` (canonical plan) and `docs/TASKS.md`
   (task register) to confirm phases and pending decisions are current.
3. Record phase-status changes in `docs/TASKS.md` and the relevant
   handoff/roadmap docs; do not invent status not evidenced in the
   repository.

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

## Pre-Pilot incident/support draft (EF-702 — DRAFT, not operational)

> This is a **draft** contributed toward the EF-702 "incident and support
> runbooks" item. There is no Pilot, no production deployment, no named
> owner, and no approved escalation procedure yet. Nothing here grants
> operational authority.

**Triage (local/synthetic only).** Reproduce or observe the issue against
the local demo stack with synthetic data. Classify: (a) environment/
readiness (probes, ports, database availability), (b) access/credentials
local setup, (c) worker/queue behavior, (d) suspected data-integrity or
security issue — for (d), stop and escalate before further action.

**Preserve evidence (sanitized).** Capture commands, outputs, and log
snippets needed to reproduce. Strip any names, emails, phone numbers,
addresses, tokens, session identifiers, or other PII/secrets before
sharing in chat, issues, or logs. Prefer synthetic reproducers over raw
payloads.

**Ownership.** The on-call/decision owner is **UNASSIGNED** — no owner is
named at this stage. Escalation and any recovery action therefore require
an explicitly assigned owner and an approved procedure before execution.
Do not proceed unilaterally on ambiguity.

**Isolation guidance (read-only first).**
- Readiness: run existing liveness/readiness probes; compare against the
  documented EF-702 slice behavior (e.g., worker tick JSON events) —
  thresholds are not defined and must not be invented here.
- Access: verify local config/credentials presence, never contents; do
  not print or transmit secrets.
- Worker: inspect the local worker tick JSON events (stdout/stderr) for
  failure classification; no external alerting exists.

**Hard boundaries.**
- **No production database actions**: no backups, restores, migrations,
  deletes, or data mutations against any non-local store. Recovery
  procedures (including restore drills) require an assigned owner and an
  approved, reviewed procedure first.
- **No PII** in chat messages, issue text, log snippets, or evidence
  artifacts.
- No invented SLAs, alert thresholds, or PDPL/privacy signoff: none
  exist yet. Privacy/regulatory acceptance is explicitly **not granted**
  by this draft.

**Escalation path (once an owner is assigned).** Document the issue with
sanitized evidence, state impact and blast radius, and obtain the owner's
explicit approval before any recovery step. Record the outcome in
`docs/TASKS.md` / a handoff note.

## Repository-state discrepancies (read-only)

- **Missing or conflicting task status**: compare `docs/TASKS.md` with the
  canonical `docs/DEVELOPMENT_PLAN.md` and the relevant handoff and merged PR.
  Do not create a parallel registry or mark a task accepted without evidence.
- **Suspected unsafe state**: stop, preserve sanitized evidence, and consult
  the assigned operator before any cleanup or recovery action.
