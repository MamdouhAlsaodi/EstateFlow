# EF-202-T8 — CRM-04 Notes/Tasks Persistence Executor

**Status:** PASS
**Task:** `EF-202-T8-NOTES-TASKS-PERSISTENCE`

## Implemented

- Added the four CRM-04 timeline enum values and `LeadTaskStatus` to Prisma schema/migration.
- Added organization+lead scoped `LeadNote` and `LeadTask` tables with composite foreign keys, required indexes, and task version constraint.
- Repaired T7 debt: `TimelineEventIntent.type` is `TimelineEventType`; CRM-04 repository command ports are mandatory.
- Implemented serializable, retry-safe Prisma note/task create, replay, idempotency-conflict, ownership, version, OPEN-only transition, and append-only timeline behavior.
- Used separate idempotency command scopes for note create, task create, task complete, and task reschedule.
- Preserved existing Lead create/update/list/detail behavior and event mappings.

## TDD evidence

- RED: after the guarded build, the new guarded integration test failed because `LeadNote`/`LeadTask` schema tables were absent.
- GREEN: after migration and implementation, the focused integration test passed: `2` passed, `0` failed.

## Verification evidence

All commands ran in one child shell with an in-memory guarded `DATABASE_URL`; the value was not printed or persisted.

- `pnpm db:test:guard` — accepted only loopback `estateflow_test`.
- `pnpm --dir apps/api run db:migrate:test` — migration applied once; final run reported no pending migrations.
- `pnpm --dir apps/api run build` — exit `0`.
- Focused domain/application/unit/integration command — `27` passed, `0` failed.
- `git diff --check` — exit `0`.

## Changed packet paths

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260812000000_ef202_lead_notes_tasks/migration.sql`
- `apps/api/src/features/leads/domain/lead.ts`
- `apps/api/src/features/leads/application/lead-repository.ts`
- `apps/api/src/features/leads/infrastructure/prisma-lead.repository.ts`
- `apps/api/test/ef202-lead.application.test.mjs`
- `apps/api/test/ef202-lead.repository.unit.test.mjs`
- `apps/api/test/ef202-lead.repository.integration.test.mjs`
- `docs/handoffs/EF-202/T8-notes-tasks-persistence-executor.md`

No HTTP/module/UI/OpenAPI/generated-client/dependency/config changes, install, commit, push, deployment, or non-test database mutation was performed.

`clean-code-guard: clean`
