# EF-203 T3 — Independent HTTP Verification (2026-08-14)

## Verdict

**PASS — guarded HTTP boundary accepted.** This acceptance is limited to EF-203 T3. OpenAPI metadata, generated client, and Web remain explicitly unimplemented and are owned by T4/T5.

## Scope independently reviewed

- `POST /organizations/:organizationId/leads/:leadId/close-won` (`201`).
- `POST /organizations/:organizationId/leads/:leadId/close-lost` (`200`).
- Closed request DTOs, existing unsafe browser guard ordering, result-to-HTTP mapping, and guarded request-level persistence evidence.

## Fresh independent evidence

| Requirement | Fresh proof |
|---|---|
| Guarded DB target | `assert-test-database`: accepted only `estateflow_test` on loopback:55433 |
| API compilation | `pnpm --dir apps/api run build`: PASS |
| Exact route/DTO/guard/error mapping | `ef202-lead.http.test.mjs`: **11/11 PASS** |
| Real Nest opaque-cookie/Origin/CSRF close behavior | `ef203-deal.http.integration.test.mjs`: **1/1 PASS** |
| Shared destructive HTTP test safety | EF-202 + EF-203 HTTP integration with `--test-concurrency=1`: **2/2 PASS** |
| Domain/application regression | EF-202 + EF-203 close/domain/application suites: **30/30 PASS** |
| Diff hygiene | `git diff --check`: PASS |

The request-level test proves `401` unauthenticated; owner `201` won; exact replay with no duplicate Deal/DealDomainEvent/close timeline; same key plus changed expectedVersion `409` with no extra rows; cross-tenant `404` without target identifiers; owner `200` lost with no Deal/domain event; and missing/extra request fields `400` before mutation.

## Explicit T4 boundary

A fresh `openapi.test.mjs` diagnostic exited non-zero because its expected path list has not yet been updated for `close-won` / `close-lost`. This drift is **expected and intentional at T3**: no Swagger metadata, OpenAPI test, generated contract, or client artifact changed. T4 must restore its contract-generation/drift gate before any client/UI work.

## Scope provenance

Only the five T3 packet paths changed; all pre-existing EF-201/EF-202/T1/T2 dirty baseline paths were preserved. No migration, schema, domain, application, repository, OpenAPI, client, Web, config, dependency, commit, push, or deploy action occurred in T3.
