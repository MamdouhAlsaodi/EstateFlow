# EF-232-T3-GUARDED-COMMISSION-HTTP

## Status
PARTIAL

## Exact changed paths
- `apps/api/src/features/finance/http/commission.controller.ts`
- `apps/api/src/features/finance/http/commission.dto.ts`
- `apps/api/src/features/finance/finance.module.ts`
- `apps/api/test/ef232-commission.http.test.mjs`
- `apps/api/test/ef232-commission.http.integration.test.mjs`
- `docs/handoffs/EF-232/T3-guarded-commission-http-executor.md`

No other paths were edited by this execution. No migration, dependency install, commit, push, deploy, client/OpenAPI, or secrets/env-file access was performed.

## Implementation
- Added exactly three guarded POST command routes, with guard order `RequireCanonicalOriginGuard`, `BrowserSessionGuard`, `CsrfGuard`.
- Added strict plan, commissionable-value, and expected-accrual DTO boundaries.
- Preserved application/repository authority: server-generated plan ID, server-generated accrual timestamp, URL deal ID, primitive request values only.
- Added opaque HTTP result mapping: 201 created, 200 replayed accrual, 409 conflict, 404 not-found, 403 access denied; domain errors become generic 400 responses.
- Added bigint-to-decimal-string response serialization.
- Added static metadata/DTO/result tests and guarded real HTTP tenant/replay integration coverage.

## TDD evidence
RED first:
```text
pnpm --dir apps/api run build && node --test --test-concurrency=1 apps/api/test/ef232-commission.http.test.mjs
```
Expected failure observed: missing `dist/features/finance/http/commission.controller.js` before production implementation.

## Fresh verification
PASS:
```text
pnpm --dir apps/api run build
node --test --test-concurrency=1 apps/api/test/ef232-commission.http.test.mjs
node scripts/assert-test-database.mjs && node --test --test-concurrency=1 apps/api/test/ef232-commission.http.integration.test.mjs
git diff --check -- apps/api/src/features/finance/http/commission.controller.ts apps/api/src/features/finance/http/commission.dto.ts apps/api/src/features/finance/finance.module.ts apps/api/test/ef232-commission.http.test.mjs apps/api/test/ef232-commission.http.integration.test.mjs
```
Static tests: 4 passed. Guarded EF-232 integration: 1 passed. Test DB preflight accepted `estateflow_test` on loopback `55433`. Cleanup/assert-empty completed in the guarded test finally block.

PARTIAL:
```text
node scripts/assert-test-database.mjs && pnpm --dir apps/api run test:integration
```
The full existing integration suite stopped on unrelated `apps/api/test/auth.repository.integration.mjs`: actual persisted user includes `platformRole: "NONE"`, while that pre-existing test expected no `platformRole`. 10 passed, 1 failed before the remaining integration files could run. This execution did not modify auth code or that test.

## Guard summary
- `clean-code-guard`: 1 fix — removed unused `Validate` import from `apps/api/src/features/finance/http/commission.dto.ts`.
