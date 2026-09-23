# EF-304 — Receivable and commission reminders

## Boundary and verdict

EF-304 implements organization-scoped, versioned finance reminder rules within the EF-301/302 contract. Rules cover receivable due-soon, receivable overdue, and commission due reminders. No new public route was added; the existing automation rules read route now includes recent finance jobs.

## Implementation

- `apps/api/src/features/automation/domain/finance-reminder.ts` defines reminder types, bounded day windows, deterministic occurrence IDs, state-derived occurrence tokens, and Arabic starter definitions.
- `FinanceReminderCoordinator` supplies due finance occurrences to the existing `AutomationScheduler.runTick`; there is no second scheduler.
- Receivable occurrence tokens include due time, status, and outstanding minor units. A payment therefore changes or removes the occurrence; paid receivables are not selected.
- Commission occurrences select only `DUE` accruals; a paid state is not selected and cannot deliver a stale queued reminder.
- `PrismaFinanceReminderRepository` keeps all candidate and target reads organization-scoped and chooses an active Owner/Manager in the same organization as the internal recipient.
- `FinanceAutomationActionExecutor` uses the established delivery port and only creates durable in-app `AutomationNotification` records. There is no email/SMS provider.
- Notification insertion is idempotent on `(organizationId, idempotencyKey)`, so a worker retry after delivery persistence cannot duplicate the notification.
- `apps/worker` remains thin. The finance sweep is API-owned and is driven by the same worker loop and tick as EF-303 Lead automations.
- Arabic automation visibility shows finance rules through the existing rule response and recent finance reminder jobs without an editor UI.

## Persistence and contract changes

- Migration `20260923130000_ef304_finance_reminders` adds durable internal notification records with organization/membership foreign keys and idempotency constraints.
- Existing `GET /organizations/{organizationId}/automation/rules` is extended with `recentFinanceJobs`; no new public route was added.
- OpenAPI was regenerated through the existing generator; `apps/api/test/openapi.test.mjs` was not edited.

## Verification evidence

- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm test` — PASS (API 42 files, Web 54 tests, API client 26 tests; worker unit suite included by workspace run).
- Guarded isolated database: `ESTATEFLOW_TEST_DB_PORT=55435`, loopback `estateflow_test`, `ALLOW_DESTRUCTIVE_TESTS=1`.
- API integration suite — PASS (18 files; finance migration applied and no pending migrations).
- Worker integration — PASS: Lead replay proof and finance due receivable reminder proof both passed; a replay poll produced exactly one durable notification.
- `pnpm generate:openapi` — PASS.
- `pnpm exec eslint apps/api/src/features/automation apps/api/src/features/notifications apps/web/src/features/automation --max-warnings=0` — PASS.

## Deferred / next boundary

- External email/SMS delivery, notification templates/approval lifecycle, quiet hours, and provider adapters remain EF-305.
- Finance reporting remains read-only and export-free until FIN-07.
- No commit, push, deployment, dependency, environment, shared-database, or real-delivery action occurred.

**Verdict: PASS**
