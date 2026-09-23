# EF-305 — Notification templates and approval policy

## Boundary and verdict

EF-305 is **PASS within the packet boundary**. Notification content is organization-scoped, bilingual, versioned, approval-gated, and delivered through an in-app fake provider only. No provider credentials or external delivery were added.

## Implementation

- `apps/api/src/features/notifications/notification-template.ts` validates Arabic/English templates, strictly allowlists interpolation variables, renders approved content, and evaluates quiet hours using the instant's organization timezone local parts (including DST transitions).
- `NotificationTemplate` versions are append-only. Draft content can be approved once; database triggers reject mutation of approved content and require a new revision. Approval and send transitions are one-way and audited in `NotificationAuditEvent`.
- `NotificationApplication` enforces the existing active Owner/Manager authority matrix. Send requests create `PENDING` approvals; direct approval-required sends have no release path. Owners/Managers approve or deny, and denial requires a reason.
- `NotificationDeliveryPolicy` stores organization timezone and quiet-hour bounds. `NotificationRecipientPreference` stores per-recipient/channel consent and opt-out. `NotificationSend` persists `SENT` and `SUPPRESSED` outcomes with typed suppression reasons.
- `NotificationProviderPort` is the future adapter boundary. EF-305 implements only `InAppFakeNotificationProvider`; email/WhatsApp have no provider or credentials.
- EF-304 automation delivery now resolves approved organization templates by key and locale, renders allowlisted variables, applies quiet-hours/consent policy, and records the explicit documented fallback when no approved template exists. Existing durable `AutomationNotification` records remain as a compatibility projection for successful in-app sends.
- The existing `AutomationScheduler.runTick` and thin `apps/worker` loop remain the only worker path; no second scheduler was introduced.
- Arabic automation visibility now includes template lifecycle, pending approval actions, and recent sends with suppression reasons.

## HTTP/OpenAPI boundary

Added guarded organization-scoped routes:

- `GET/POST /organizations/{organizationId}/notifications/templates`
- `POST /organizations/{organizationId}/notifications/templates/{templateId}/revisions`
- `POST /organizations/{organizationId}/notifications/templates/{templateId}/approve`
- `GET /organizations/{organizationId}/notifications/approvals`
- `POST /organizations/{organizationId}/notifications/send-requests`
- `POST /organizations/{organizationId}/notifications/approvals/{approvalId}/approve`
- `POST /organizations/{organizationId}/notifications/approvals/{approvalId}/reject`
- `GET /organizations/{organizationId}/notifications/sends`
- `POST /organizations/{organizationId}/notifications/policy`
- `POST /organizations/{organizationId}/notifications/preferences`

OpenAPI was regenerated using the existing generator and the generated client now includes the notification operations. `apps/api/test/openapi.test.mjs` was not edited; its current exact legacy path inventory therefore reports the expected failure for these 11 newly public paths.

## Database

- `20260924100000_ef305_notification_templates_approvals`
- `20260924110000_ef305_immutability_guards`

Both migrations were applied to the guarded `estateflow_test` database. No Prisma schema model or dependency was added; the existing raw-SQL persistence convention is reused.

## Verification evidence

- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm --dir apps/api run test` — PARTIAL: existing unit files pass until the uneditable legacy `apps/api/test/openapi.test.mjs`; that test expects the pre-EF-305 exact path inventory and fails only because the 10 new notification paths are now present.
- Guarded API integration suite with `ESTATEFLOW_TEST_DB_PORT=55435`, loopback `estateflow_test`, and `ALLOW_DESTRUCTIVE_TESTS=1` — PASS (18 files; existing applicable integration tests pass).
- `pnpm --dir apps/worker run test` — PASS (4/4).
- Guarded worker integration — PASS (2/2), including due receivable reminder exactly-once replay proof through the templated delivery path.
- `pnpm generate:openapi` — PASS.
- `pnpm --dir apps/api run build` and `pnpm --dir apps/web run typecheck` — PASS.
- `git diff --check` and touched-file Prettier are required final gates; no commit, push, deployment, shared DB, credentials, or real provider action occurred.

## Deferred

- EF-306 owns the broader automation rule/detail/execution UI.
- Real email/WhatsApp adapters and credentials remain deferred pending explicit approval.
- Finance reporting remains read-only and export-free until FIN-07.
