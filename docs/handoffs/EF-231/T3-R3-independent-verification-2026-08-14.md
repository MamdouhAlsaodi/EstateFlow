# EF-231 T3-R3 — Independent OpenAPI Generation Runtime-Config Verification (2026-08-14)

## Verdict

**PASS — accepted as the generation workflow prerequisite for T4.**

## Independent verification

```text
API build: PASS
Focused OpenAPI runtime-config test: 1/1 PASS
pnpm run generate:openapi: PASS
pnpm run check:openapi-drift: PASS
API-client build: PASS
Generated-client suite: 15/15 PASS
git diff --check: PASS
```

## Contract review

- `generate-openapi.mjs` sets its own synthetic test runtime before dynamically importing Nest application modules: test environment, canonical test origin, deterministic non-secret hash inputs, and literal `ESTATEFLOW_AUTH_FAKE_DELIVERY=true`.
- It deletes `DATABASE_URL`, so OpenAPI generation does not depend on or use a database connection.
- `check-openapi-drift.mjs` establishes the same controlled runtime before spawning generation into a temporary directory.
- The focused test injects missing/conflicting runtime values including a sensitive marker; generation succeeds to a temporary directory, artifacts and output do not disclose the marker, and tracked artifacts remain byte-identical during the test.
- No API/auth/HTTP/schema/OpenAPI metadata/client-template/Web behavior was modified by this prerequisite repair.

## Deferred test update

`apps/api/test/openapi.test.mjs` still has an intentional stale expected path list that lacks the accepted EF-231 Finance routes. It is not a R3 defect and was outside R3 scope. T4 owns its precise update together with Finance OpenAPI metadata, closed-world generator operations, canonical artifacts, and client serialization proof.
