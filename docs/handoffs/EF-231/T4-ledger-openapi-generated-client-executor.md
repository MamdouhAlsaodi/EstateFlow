# Role Report — EF-231-T4-LEDGER-OPENAPI-GENERATED-CLIENT

## Status
PARTIAL

## Goal
Published the accepted five-command EF-231 Ledger HTTP contract through exact OpenAPI metadata and the closed-world generated client. No Web or Finance core/DTO semantic changes were made.

## Allowed paths used
- `apps/api/src/features/finance/http/ledger.controller.ts`
- `apps/api/test/openapi.test.mjs`
- `scripts/openapi-client-template.mjs`
- `packages/api-client/openapi.json` (canonical generation only)
- `packages/api-client/src/generated.ts` (canonical generation only)
- `packages/api-client/test/generated-client.test.mjs`
- `docs/handoffs/EF-231/T4-ledger-openapi-generated-client-executor.md`

## Files changed
- Added exact Swagger operation/parameter/body metadata for the five existing Ledger POST routes.
- Added exact OpenAPI contract assertions, including UUID parameters, statuses, closed enums, bounds, UTC date-time fields, nested line constraints, canonical `amountMinor` string pattern, and no Ledger idempotency header.
- Extended the template closed-world registry to accept only the five `LedgerController_*` mutations and reject undocumented Ledger mutations diagnostically.
- Added generated client methods `createAccount`, `createAccountingPeriod`, `createDraft`, `post`, and `reverse`; path values are URL-encoded, JSON bodies use `content-type: application/json`, and reverse sends no body.
- Added client assertions for every Ledger command and `amountMinor` string preservation.
- Generated `openapi.json` and `generated.ts` only through `pnpm run generate:openapi`.

## Commands run
### TDD RED
```text
pnpm --dir apps/api run build && pnpm --dir apps/api exec node --test --test-concurrency=1 test/openapi.test.mjs
exit 1: expected Ledger UUID metadata was absent.

pnpm --dir apps/api run build && node --test packages/api-client/test/generated-client.test.mjs
exit 1: client.createAccount was not present and undocumented Ledger mutation was not rejected.
```

### GREEN and verification
```text
pnpm --dir apps/api run build
exit 0

pnpm --dir apps/api exec node --test --test-concurrency=1 test/openapi.test.mjs
1 pass, 0 fail

pnpm run generate:openapi
exit 0

pnpm run check:openapi-drift
exit 0

node --test scripts/openapi-generation-runtime.test.mjs
1 pass, 0 fail

pnpm --dir packages/api-client run build
exit 0

pnpm --dir packages/api-client exec node --test --test-concurrency=1 test/generated-client.test.mjs
17 pass, 0 fail

pnpm --dir apps/api exec node --test --test-concurrency=1 test/openapi.test.mjs test/ef231-ledger.http.test.mjs
5 pass, 0 fail

pnpm --dir apps/api run typecheck
exit 0

node --test scripts/openapi-generation-runtime.test.mjs
1 pass, 0 fail

git diff --check -- [all seven allowed paths]
exit 0
```

## Observed output
The generated OpenAPI finance paths are exactly:
- `/organizations/{organizationId}/finance/accounts` — `LedgerController_createAccount` — `201`
- `/organizations/{organizationId}/finance/accounting-periods` — `LedgerController_createAccountingPeriod` — `201`
- `/organizations/{organizationId}/finance/journal-drafts` — `LedgerController_createDraft` — `201`
- `/organizations/{organizationId}/finance/journal-entries/{entryId}/post` — `LedgerController_post` — `200`
- `/organizations/{organizationId}/finance/journal-entries/{entryId}/reverse` — `LedgerController_reverse` — `201`

The generated schema contains `amountMinor` as `type: string` with exact pattern `^[1-9]\\d*$`; body and line objects have `additionalProperties: false`; reverse has no request body.

## Verification
- API build: PASS.
- API exact OpenAPI contract test: PASS, `1 pass, 0 fail`.
- OpenAPI runtime generation test: PASS, `1 pass, 0 fail`.
- Canonical generation: PASS.
- OpenAPI drift check: PASS.
- API-client build: PASS.
- Full generated-client suite: PASS, `17 pass, 0 fail`.
- Static EF-231 HTTP test: PASS, included in `5 pass, 0 fail`.
- Guarded real HTTP integration: NOT RUN. No explicitly supplied inherited guarded test-database configuration was used; no database action was taken.
- Scoped diff check: PASS, `git diff --check` exit `0`.

## Execution lifecycle
Completed in one execution. No timeout, cancellation, signal, commit, push, deploy, install, secrets/environment-file access, or database action.

## Touched paths observed
The allowed changed paths are listed under **Files changed**. Existing unrelated dirty work was preserved and not modified.

## Session/resume reference
Not applicable.

## Risks
Real guarded HTTP/database integration remains unverified because the packet did not supply the required inherited guarded DB configuration.

## Recommended next human decision
Run the separately governed guarded EF-231 HTTP integration only after explicitly supplying the inherited test-database configuration; otherwise accept this packet as PARTIAL with the static/OpenAPI/client evidence above.
