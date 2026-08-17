# EF-232 T4 — Commission OpenAPI / Generated Client

## Status
PASS

## Scope
Implemented the exact closed-world EF-232 commission contract in the allowed paths only:

- Added Swagger metadata for exactly three guarded CommissionController POST commands.
- Added static OpenAPI assertions for paths, stable operation IDs, required UUID parameters, closed request schemas, status codes, and absence of invented idempotency headers.
- Added a dedicated CommissionController generator registry with exact body/path/status validation and rejection of unknown CommissionController operations.
- Generated exactly `createCommissionPlanVersion`, `captureCommissionableValue`, and `createExpectedAccrual` through the canonical generator.
- Added generated-client serialization and rejection tests, including decimal `amountMinor` preservation and encoded organization/deal path values.

No DB, migration, Web, auth/domain/application/repository behavior, install, commit, push, deploy, dotenv, secrets, or manual artifact editing was performed.

## TDD RED evidence
Added the unsupported CommissionController operation test before generator extension and ran:

```text
node --test --test-concurrency=1 packages/api-client/test/generated-client.test.mjs
```

Observed expected RED: 17 passed, 1 failed; `AssertionError: Missing expected exception` for the new unsupported CommissionController rejection test.

## Fresh verification
All packet commands passed in the final verification run:

```text
pnpm --dir apps/api run build
# exit 0

node --test --test-concurrency=1 apps/api/test/openapi.test.mjs scripts/openapi-generation-runtime.test.mjs
# 2 passed, 0 failed

pnpm run generate:openapi
# exit 0; canonical artifacts regenerated

pnpm run check:openapi-drift
# exit 0

pnpm --dir packages/api-client run build
# exit 0

pnpm --dir packages/api-client test
# 19 passed, 0 failed

git diff --check -- apps/api/src/features/finance/http/commission.controller.ts apps/api/test/openapi.test.mjs scripts/openapi-client-template.mjs packages/api-client/openapi.json packages/api-client/src/generated.ts packages/api-client/test/generated-client.test.mjs
# exit 0
```

## Guard summary
`clean-code-guard`: clean; no unrelated production-code refactor was introduced. Canonical generated files were written only by `pnpm run generate:openapi`.
