# EF-231 T3-R3 — OpenAPI generation runtime-config executor report

## Status

**PARTIAL**

Runtime-config recovery is implemented and the generation/drift workflows pass. The existing API OpenAPI test remains blocked by a pre-existing/stale expected path list that omits the EF-231 finance routes; that test path was forbidden by this packet.

## Scope

Allowed paths changed:

- `scripts/generate-openapi.mjs`
- `scripts/check-openapi-drift.mjs`
- `scripts/openapi-generation-runtime.test.mjs`
- this report

The generator now sets, before dynamic Nest imports, the explicit synthetic test runtime:

- `NODE_ENV=test`
- `ESTATEFLOW_BROWSER_ORIGIN=https://app.estateflow.test`
- deterministic 32-byte non-secret hash values
- `ESTATEFLOW_AUTH_FAKE_DELIVERY=true`

Caller values cannot override those values. `DATABASE_URL` is removed from the generator child environment, and neither script reads `.env` files, logs runtime configuration, or uses a database.

The existing source generator and temporary-directory drift comparison remain unchanged in behavior. No generated artifact was manually edited; canonical generation was used only during final verification.

## TDD RED → GREEN evidence

1. Added `scripts/openapi-generation-runtime.test.mjs` first.
2. RED command:

   ```text
   node --test scripts/openapi-generation-runtime.test.mjs
   exit 1
   ```

   The generator exited `1` because Nest was imported before the synthetic runtime configuration existed.
3. GREEN implementation: explicit runtime setup plus dynamic Nest imports in both scripts.
4. GREEN command:

   ```text
   node --test scripts/openapi-generation-runtime.test.mjs
   1 pass, 0 fail
   ```

The focused test runs with missing/conflicting external runtime values, generates valid temporary OpenAPI/client artifacts, checks that the sensitive marker is absent from output, and verifies tracked artifacts are byte-for-byte unchanged.

## Verification evidence

```text
pnpm --dir apps/api run build
exit 0

node --test scripts/openapi-generation-runtime.test.mjs
1 pass, 0 fail

pnpm run generate:openapi
exit 0

pnpm run check:openapi-drift
exit 0

pnpm --dir apps/api exec node --test --test-concurrency=1 test/openapi.test.mjs
exit 1
```

The existing API OpenAPI test failure is an assertion mismatch: actual OpenAPI includes these finance paths, while the test expected list omits them:

- `/organizations/{organizationId}/finance/accounts`
- `/organizations/{organizationId}/finance/accounting-periods`
- `/organizations/{organizationId}/finance/journal-drafts`
- `/organizations/{organizationId}/finance/journal-entries/{entryId}/post`
- `/organizations/{organizationId}/finance/journal-entries/{entryId}/reverse`

Updating that forbidden test is outside this packet.

Additional checks:

```text
pnpm exec prettier --check scripts/generate-openapi.mjs scripts/check-openapi-drift.mjs scripts/openapi-generation-runtime.test.mjs
PASS

git diff --check -- [four allowed paths]
PASS
```

Canonical generation updated the existing tracked OpenAPI/client artifacts through `pnpm run generate:openapi`; no artifact was hand-edited. No database, HTTP, environment-file, install, commit, push, deploy, or production API behavior action was performed.
