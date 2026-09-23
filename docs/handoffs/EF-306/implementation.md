# EF-306 — Automation UI

## Boundary and verdict

EF-306 is **PASS within the packet boundary** and closes Phase 3. Arabic-first
rule list/detail, organization/rule execution history, and Owner/Manager-gated
retry/cancel are live in the web app; the API exposes the missing guarded job
endpoints. No raw provider payload, secret, or execution key is ever rendered
or returned; no rule editor beyond enable/disable exists; `apps/worker` and
`apps/api/test/openapi.test.mjs` were not touched.

## Implementation

### API (guarded, organization-scoped, EF-305 route patterns)

- `domain/execution.ts` — retry policy: `canRetryAutomationJob` (FAILED only),
  `canCancelAutomationJob` (QUEUED/RETRYING only), `deriveRetryExecutionKey`
  (deterministic key naming the source job), and `createRetryAutomationJob`
  which copies the failed occurrence's rule/action/target shape into a NEW
  QUEUED job. The existing `(organizationId, executionKey)` unique constraint
  makes a repeated retry idempotent: the second insert resolves to a typed
  duplicate, never a second side effect.
- `application/job-repository.ts` + `prisma-automation-job.repository.ts` —
  added `findJob` (org-scoped by id), `listRecentJobs` (org-wide history), and
  `saveJobCancellation` (atomic UPDATE guarded on `status IN
('QUEUED','RETRYING')`, so a concurrent scheduler claim always wins the race).
- `application/rule-application.ts` — `listRuleJobs` (resolves the rule inside
  the organization first; foreign rule ids are typed `not-found`),
  `listOrganizationJobs`, `getJob`, `retryJob` (FAILED only → new occurrence /
  `duplicate`), `cancelJob` (QUEUED/RETRYING only → in-place cancel / lost-race
  `conflict`). All commands run through the existing active Owner/Manager
  authority matrix; BROKER/CLIENT and suspended memberships are denied.
- `http/automation-rule.controller.ts` — five new endpoints (see contract
  below). GETs use `BrowserSessionGuard`; retry/cancel use the canonical
  origin + session + CSRF stack. `invalid-state`, `duplicate`, and `conflict`
  map to `409`; `not-found` to tenant-safe `404`; `access-denied` to `403`.
- `http/automation-rule.dto.ts` / `.openapi.ts` — closed-world `jobItem`
  rendering and response schemas: id, rule, version, trigger kind, event type,
  action/target, status, attempt counts, typed `lastError {kind, message}`,
  and UTC instants only. No action payload, execution key, event id, provider
  payload, or secret field exists anywhere in the contract.

### New public routes (for the supervisor's `openapi.test.mjs` update)

- `GET  /organizations/{organizationId}/automation/jobs`
- `GET  /organizations/{organizationId}/automation/rules/{ruleId}/jobs`
- `GET  /organizations/{organizationId}/automation/jobs/{jobId}`
- `POST /organizations/{organizationId}/automation/jobs/{jobId}/retry` (201;
  duplicate retry → 409)
- `POST /organizations/{organizationId}/automation/jobs/{jobId}/cancel` (200)

### Web (Arabic-first, mobile-responsive, no editor UI)

- `automation-contract.ts` — strict closed-world normalizers for job lists,
  job detail, and rule detail (unknown fields, non-enum statuses, and
  non-enum error kinds are rejected before they reach the UI).
- `automation-labels.ts` — Arabic labels for job states, typed error kinds,
  trigger kinds, actions, targets, and condition operators, plus the
  retry/cancel state predicates (FAILED retry; QUEUED/RETRYING cancel).
- `automation-jobs-api.ts` — feature API adapter; reads are plain GETs, every
  mutation posts through the session CSRF provider with a fresh idempotency
  key, and all payloads are normalized before rendering.
- `automation-job-list.tsx` — shared typed history rendering (states,
  timestamps, attempt counts, `سبب الفشل` with Arabic kind labels) with
  per-state retry/cancel actions and links to the owning rule.
- `rule-detail-view.tsx` — current definition (trigger/conditions/action in
  Arabic), immutable version timeline, enable/disable as the only rule editor
  action, and this rule's execution history.
- `jobs-history-view.tsx` — organization-wide execution history.
- New routes: `/ar/organizations/[organizationId]/automation/jobs` and
  `/ar/organizations/[organizationId]/automation/rules/[ruleId]`; the overview
  page now links rules to their detail and to the org history. Single-column
  mobile layout via the existing 640px media-query pattern.

## OpenAPI/client

`pnpm generate:openapi` regenerated `packages/api-client/openapi.json` and
`src/generated.ts` (five new automation operations). The generator template
gained the matching operation contracts and an explicit HTTP-method override
for GET operations whose ids do not end in `_list`/`_find`.
`apps/api/test/openapi.test.mjs` was not edited; its frozen pre-EF-306 path
inventory therefore fails on exactly the five new paths (same expected legacy
failure recorded for EF-305). The supervisor owns that update.

## Database

No schema change and no migration. Retry linkage lives in the derived
execution key; cancel reuses the EF-302 lifecycle columns.

## Verification evidence

- `pnpm lint` — PASS (includes workspace + infrastructure checks).
- `pnpm typecheck` — PASS.
- API unit suite — PASS except the supervisor-owned `openapi.test.mjs`, whose
  only assertion failure is the exact-path inventory missing the five new
  automation paths; every other unit file passes, including
  `ef306-automation-jobs.http.test.mjs` (6/6) and the organization suites
  re-run explicitly after the alphabetically-earlier failure (23/23 combined).
- Web tests — PASS 62/62 (includes 8 new `automation-jobs.test.ts`).
- API client tests — PASS 26/26; worker unit — PASS 4/4.
- Guarded integration suite (`ESTATEFLOW_TEST_DB_PORT=55435`, loopback
  `estateflow_test`, `ALLOW_DESTRUCTIVE_TESTS=1`) — 19 API files PASS,
  including `ef306-automation-jobs.integration.test.mjs`: authority matrix
  (Owner/Manager allowed; Broker and suspended Manager denied), tenant
  isolation (foreign org rule/job ids typed not-found, zero org-B leakage),
  retry-new-occurrence (new QUEUED row, deterministic retry key, second retry
  = typed duplicate with exactly one row), cancel gating (queued cancelled;
  failed/succeeded/cancelled → invalid-state), and bounded history listings.
  Worker integration 2/2 PASS. Pre-existing note: the EF-121 runtime smoke in
  `organization.http.integration.test.mjs` skips on this machine because that
  file hard-checks port 55433 (occupied by an unrelated container); unchanged
  by this packet.
- `pnpm build` with `API_ORIGIN=http://127.0.0.1:3000` — PASS; web build emits
  `/ar/organizations/[organizationId]/automation/jobs` and
  `/ar/organizations/[organizationId]/automation/rules/[ruleId]`.
- `pnpm check:openapi-drift` — PASS.
- `git diff --check` — PASS; Prettier applied to every touched file.

## Deferred / next boundary

- Phase 3 is COMPLETE. The next product task is **EF-401 Campaigns and
  attribution** (Phase 4).
- The five new routes await the supervisor's `openapi.test.mjs` inventory
  update; until then `pnpm test` reports exactly that known failure.
- No commit, push, deployment, dependency change, `.env` change, shared
  database, worker change, or real-provider action occurred.

**Verdict: PASS**
