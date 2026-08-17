# EF-203 T4 — Independent OpenAPI and Client Verification (2026-08-14)

## Verdict

**PASS — EF-203 T4 accepted.** This closes the generated OpenAPI/client boundary only. T5 remains the only packet authorized to expose close outcomes in the Web workspace.

## Scope independently reviewed

- Swagger metadata for the already accepted `close-won` / `close-lost` HTTP routes.
- `CloseLostDto` non-whitespace parity with its OpenAPI schema.
- The existing closed-world OpenAPI generator, restricted to exactly two additional Lead close operations.
- Generator-produced `openapi.json` and generated client outputs.
- Generated-client serialization/contract rejection tests.

## Fresh independent evidence

| Requirement | Command / result |
|---|---|
| Guarded prerequisite | `assert-test-database`: accepted `estateflow_test` on loopback:55433 |
| API compilation | `pnpm --dir apps/api run build`: PASS |
| Static HTTP/DTO/OpenAPI contract | `ef202-lead.http.test.mjs` + `openapi.test.mjs`: **12/12 PASS** |
| Generator source output | `pnpm run generate:openapi`: PASS |
| Tracked artifact provenance | immediate `pnpm run check:openapi-drift`: PASS |
| Generated client compilation | `pnpm --dir packages/api-client run build`: PASS |
| Generated client behavior | `generated-client.test.mjs`: **15/15 PASS** |
| T3 real HTTP regression | `ef203-deal.http.integration.test.mjs`: **1/1 PASS** |
| Shared destructive HTTP safety | EF-202 + EF-203 HTTP integration serial: **2/2 PASS** |
| Hygiene / forbidden generic API | no `DealController`, `/deals`, or generic Deal API in generated contract/client; `git diff --check`: PASS |

## Accepted contract

- `closeLeadWon(params, body)` serializes only encoded `organizationId`/`leadId`, fresh caller-supplied idempotency key, JSON `{ propertyId, brokerId, expectedVersion }`, and `POST .../close-won`.
- `closeLeadLost(params, body)` serializes the corresponding `{ reason, expectedVersion }` and `POST .../close-lost`.
- The generator validates exact required path/header/body/status contracts before emitting code: Won `201`, Lost `200`.
- `CloseLostDto` and OpenAPI now both reject whitespace-only reason values (`\S`), while domain normalization remains authoritative.
- Any unlisted Lead mutation remains rejected by the closed-world generator.

## Recovery provenance

The original T4 executor correctly stopped **BLOCKED** when the generator rejected the newly documented operation. T4-R1 changed the generator allowlist and validation only for the two accepted operations, then generated artifacts through the repository command. No generated artifact was manually edited.

## Excluded scope

No Web UI or transport integration, persistence/domain/migration change, generic Deal resource, finance/campaign/viewing/outbox work, configuration/dependency/install, commit, push, or deployment.
