# EF-233 T3 — Independent Verification

**Date:** 2026-08-17
**Verdict:** PASS

## Accepted boundary

Exactly three guarded Owner/Manager HTTP commands were added:

1. Create an invoice draft for an organization-scoped Deal.
2. Issue a draft invoice and atomically create its receivable.
3. Record an idempotent partial/full payment.

The boundary remains deliberately excluded from Swagger/OpenAPI with `ApiExcludeController`; EF-233 T4 owns OpenAPI and generated-client publication. No Web, dashboard, Prisma schema, migration, repository, domain, or application contract changed.

## Changed production paths

- `apps/api/src/features/finance/http/receivable.controller.ts`
- `apps/api/src/features/finance/http/receivable.dto.ts`
- `apps/api/src/features/finance/finance.module.ts`

## Verification paths

- `apps/api/test/ef233-receivable.http.test.mjs`
- `apps/api/test/ef233-receivable.http.integration.test.mjs`

## Contract proof

- Canonical Origin, opaque browser session, and CSRF guards protect all three POST routes.
- Route organization/resource identifiers use `ParseUUIDPipe`.
- Amounts enter HTTP as canonical positive decimal strings and become `bigint` internally.
- Currency accepts uppercase three-letter codes only.
- Command timestamps require strict UTC ISO strings with milliseconds and `Z`.
- Unknown DTO properties are rejected by the global closed validation boundary.
- Invoice and payment identifiers are generated internally; callers cannot supply them.
- Payment UUID identity is deterministic from organization, receivable, and normalized `Idempotency-Key`, preserving exact retries without exposing identity authority to the caller.
- Created/issued/recorded responses use `201`; exact issue/payment replays use `200`.
- Access denial maps to `403`, tenant-scoped missing resources to `404`, typed conflicts to `409`, and typed validation/state errors to `400`.
- BigInt values serialize as decimal strings and Date values as ISO strings.

## Fresh evidence

```text
pnpm format:check
PASS

pnpm --dir apps/api lint
PASS

pnpm --dir apps/api typecheck
PASS

env -u DATABASE_URL -u ALLOW_DESTRUCTIVE_TESTS pnpm --dir apps/api test
261 passed, 0 failed, 19 guarded integration tests skipped

DATABASE_URL=<isolated-test-url> ALLOW_DESTRUCTIVE_TESTS=1 node scripts/assert-test-database.mjs
Destructive test database target accepted: estateflow_test on loopback:55433.

DATABASE_URL=<isolated-test-url> ALLOW_DESTRUCTIVE_TESTS=1 node --test --test-concurrency=1 apps/api/test/ef233-receivable.http.integration.test.mjs
1 passed, 0 failed

git diff --check
PASS
```

The guarded runtime test proves unauthenticated denial, missing-CSRF denial, canonical-Origin denial, Broker denial, Owner/Manager success, cross-tenant `404`, draft/issue/payment lifecycle, exact replay, idempotency conflict, no overpayment, bigint-safe output, and final database counts/balance. Its `finally` block truncates and verifies the explicit test-table allowlist.

## Clean-code guard

- Replaced a caller-retry-breaking random payment ID with a server-owned deterministic UUID identity.
- Preserved Date values during recursive HTTP serialization.
- Removed explicit `any` from result mapping and used `unknown` with a narrow result-kind guard.
- Renamed generic helpers to reveal boundary intent.

`clean-code-guard: 4 fixed, 0 flagged for author`

## Deferred

- Swagger/OpenAPI and generated client: EF-233 T4.
- Web/dashboard controls: separate boundary after T4.
- Invoice cancellation/amendment, ledger posting, aging/read dashboards, exports, reminders, payment gateway, bank reconciliation, and provider behavior remain outside T3.
