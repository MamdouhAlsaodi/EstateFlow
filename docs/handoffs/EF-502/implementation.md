# EF-502 — Viewing reminders and outcome automation

## Boundary and verdict

EF-502 is **PASS within the packet boundary**. Confirmed viewings now create deterministic 24-hour and 1-hour reminder occurrences, rescheduling voids the old occurrences and creates a new schedule occurrence, cancellation/completion/no-show void pending reminders, and completion creates an outcome-request occurrence. All occurrences enter the existing EF-302 durable job path through `AutomationScheduler.runTick`; no second scheduler was added.

Completion automation creates one idempotent Lead follow-up task and an in-app outcome request notification. The notification contains only a suggested Lead stage (`QUALIFIED` by the starter rule); it never changes Lead state. Lead closing is not called anywhere in EF-502.

## Implementation

- `apps/api/src/features/automation/domain/viewing-automation.ts` defines stable UUID occurrence identities over `(organization, viewing, kind, occurrence)`, exact UTC reminder offsets, and Arabic starter rules for 24h, 1h, and outcome follow-up.
- `ViewingAutomationOccurrence` is durable raw-SQL persistence with tenant/viewing foreign keys, unique occurrence identity, pending/voided state, and a suggested-stage field.
- `PrismaViewingRepository` schedules reminders atomically with confirmation/reschedule transitions, voids pending rows atomically with cancel/reschedule/completion/no-show, and schedules an outcome request atomically with completion.
- `AutomationOccurrenceCoordinator` combines viewing and finance occurrence sources for the same scheduler tick. `ViewingAutomationActionExecutor` validates the current pending occurrence, delivers through the existing EF-305 in-app/template port, and uses the existing Lead repository idempotency contract for follow-up task creation.
- The EF-301 action allowlist includes `CREATE_VIEWING_FOLLOW_UP`; migration `20260930110000_ef502_viewing_follow_up_action` extends the EF-302 job constraint.
- Approved EF-305 templates are selected by the viewing template keys. When no approved template exists, the existing EF-305 documented generic in-app fallback is used; no email, WhatsApp, external provider, or credential was added.
- Arabic viewing detail at `/ar/organizations/:organizationId/viewings/:viewingId` renders upcoming pending reminders. The existing Arabic automation page labels and displays the viewing rules alongside existing rule/job history.

## Routes and contract

No new API route was required. Existing EF-501 viewing routes return `upcomingReminders` on the viewing detail response. `apps/api/test/openapi.test.mjs` was not edited. `packages/api-client/openapi.json` was regenerated and the generated OpenAPI drift check passes.

## Verification evidence

All commands used the isolated test target where database access was required:

```text
ESTATEFLOW_TEST_DB_PORT=55435
DATABASE_URL=postgresql://estateflow_test:test_only_change_me@127.0.0.1:55435/estateflow_test
ALLOW_DESTRUCTIVE_TESTS=1
```

- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm test` — PASS (API 54 files; Web 79 tests; worker unit suite included).
- `pnpm test:integration` — PASS. API 29 integration files passed, including `ef502-viewing-automation.repository.integration.test.mjs`; worker Lead, finance, EF-502 viewing, and EF-404 restart tests passed.
- EF-502 worker proof: due reminder after reschedule reset creates exactly one `NotificationSend` and one compatibility `AutomationNotification`; replay creates no second delivery.
- `API_ORIGIN=http://127.0.0.1:3000 pnpm build` — PASS.
- `pnpm check:openapi-drift` — PASS.
- `git diff --check` — PASS.
- Touched TypeScript/TSX/JSON/Markdown/MJS files were formatted with Prettier. SQL migrations have no Prettier parser; SQL syntax was applied successfully by Prisma migration deploy.

## Deferred / unchanged

- No geo search, radius/polygon search, or map work; EF-510 remains next.
- No automatic Lead transition or Lead closing.
- No external delivery, dependency, environment, shared database, commit, push, or deployment action.

**Verdict: PASS**
