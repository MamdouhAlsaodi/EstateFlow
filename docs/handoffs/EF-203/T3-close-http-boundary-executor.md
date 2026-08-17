# EF-203 T3 — Close HTTP Boundary Executor

## Status

PASS

## Scope

Executed exactly `EF-203-T3-CLOSE-HTTP-BOUNDARY` in execution mode with the inherited guarded isolated test database. Existing dirty work outside the packet was preserved. No credentials, URLs, cookies, CSRF values, or raw authentication material were logged or stored in this report.

## Changes

Allowed paths only:

- `apps/api/src/features/leads/http/lead.dto.ts`
  - Added strict `CloseWonDto` and `CloseLostDto` request DTOs.
- `apps/api/src/features/leads/http/lead.controller.ts`
  - Added guarded `POST .../close-won` returning 201.
  - Added guarded `POST .../close-lost` returning 200.
  - Passed authenticated actor, user, path identifiers, DTO fields, expected version, and case-insensitive header value with empty fallback.
  - No OpenAPI annotations were added for the new routes.
- `apps/api/test/ef202-lead.http.test.mjs`
  - Extended static controller/DTO/error-mapping coverage for the exact close boundary.
- `apps/api/test/ef203-deal.http.integration.test.mjs`
  - Added guarded real Nest request integration with cleanup and explicit table allowlist.

## RED evidence

Before implementation, the new static test failed because the close DTO exports/routes were absent, and the real HTTP request returned 404 because the close routes were absent. The expected missing-boundary RED state was observed before production changes.

## Verification

- `node scripts/assert-test-database.mjs` — PASS; guarded isolated target accepted.
- `pnpm --dir apps/api run build` — PASS.
- `node --test apps/api/test/ef202-lead.http.test.mjs` — PASS, 11/11.
- Serial guarded EF-202 + EF-203 HTTP integration — PASS, 2/2.
- Domain/application regression command — PASS, 30/30.
- `git diff --check` — PASS.

The HTTP integration proves unauthenticated 401, owner 201 won, exact replay without duplicate Deal/event/timeline rows, changed expected version with same key 409 without mutation, cross-tenant 404 without target identifiers in the response, owner 200 lost with no Deal/domain event, missing header 400, and malformed/extra DTO rejection before mutation.

## Explicit deferrals

OpenAPI annotations, OpenAPI artifacts, the canonical OpenAPI expected-path test, client generation, Web/client code, schema/migrations, and domain/application/persistence changes were untouched and remain deferred to T4 or their owning packet.
