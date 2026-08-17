# EF-202-T7 — CRM-04 Notes/Tasks Domain Executor

**Status:** PASS
**Task:** `EF-202-T7-NOTES-TASKS-DOMAIN`

## Implemented

- Added exactly four timeline types: `LEAD_NOTE_ADDED`, `LEAD_TASK_CREATED`, `LEAD_TASK_COMPLETED`, `LEAD_TASK_RESCHEDULED`.
- Added immutable Lead Note creation with trimmed 2,000-character body validation and exact note event data.
- Added Lead Task creation with trimmed 500-character title, finite due date validation, `OPEN` status, version `1`, and exact event data.
- Added OPEN-only task completion and rescheduling with expected-version checks, version increments, timestamps, and exact event data allowlists.
- Added typed repository command ports/results for note/task create, complete, and reschedule operations, including replay, idempotency, stale-version, ownership, and invalid-key outcomes.
- Added application authorization-before-repository behavior, organization/actor/idempotency propagation, server-generated IDs, and focused tests.
- Preserved existing Lead lifecycle behavior. No persistence, schema, migration, HTTP, UI, generated client, dependency, or configuration changes were made by this packet.

## TDD evidence

- RED observed before implementation: focused tests failed because the CRM-04 domain exports and application methods were absent.
- GREEN observed after implementation: all focused tests passed.

## Verification evidence

- `source ~/.nvm/nvm.sh && pnpm --dir apps/api run build` — exit `0`.
- `node --test apps/api/test/ef202-lead.domain.test.mjs apps/api/test/ef202-lead.application.test.mjs` — `19` passed, `0` failed.
- `git diff --check` — exit `0`.

## Scope

Changed packet paths only: the three listed Lead domain/application files, the two focused EF-202 tests, and this report. No database or credentials were accessed; no install, commit, push, deploy, or generated artifact operation was performed.

`clean-code-guard: clean`
