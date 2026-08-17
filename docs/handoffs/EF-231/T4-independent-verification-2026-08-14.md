# EF-231 T4 — Independent OpenAPI / Generated Client Verification (2026-08-14)

## Verdict

**PASS — accepted.**

## Scope and provenance

T4 remained within its seven authorized paths:

- Finance Ledger Swagger metadata in the existing controller
- API OpenAPI contract test
- closed-world client generator template
- generated OpenAPI document and client, produced only through canonical generation
- generated-client wire tests
- executor report

No Finance domain, application, repository, DTO, schema, migration, module, Web, deployment, or external integration source changed in this packet. Broader repository dirty work was pre-existing and preserved.

## Fresh independent verification

All database actions were preceded by the destructive test-database guard, which accepted isolated `estateflow_test` on loopback.

```text
Prisma generate: PASS
Prisma migrate deploy: 8 migrations; no pending migrations
API build: PASS
EF-231 domain/application/repository/static HTTP/real HTTP + EF-203 HTTP: 28/28 PASS
OpenAPI synthetic-runtime safety test: 1/1 PASS
pnpm run generate:openapi: PASS
pnpm run check:openapi-drift: PASS
API-client build: PASS
Generated-client suite: 17/17 PASS
git diff --check: PASS
```

## Contract evidence

OpenAPI publishes exactly these five accepted Ledger POST operations:

1. `LedgerController_createAccount` → `201`
2. `LedgerController_createAccountingPeriod` → `201`
3. `LedgerController_createDraft` → `201`
4. `LedgerController_post` → `200`
5. `LedgerController_reverse` → `201`

The contract independently proves required UUID path parameters, exact JSON body fields, no unapproved additional properties, draft line bounds, debit/credit enum, three-character currency, and `amountMinor` as the canonical positive decimal **string** pattern `^[1-9]\\d*$`. Reverse has no request body and no fabricated idempotency header.

The generated client has only the approved Ledger methods, URL-encodes path values, sends precise POST JSON wire payloads, preserves `amountMinor` as a string, and sends reverse as `{ method: "POST" }` without a body. A synthetic undocumented Ledger operation is rejected by the closed-world generator.

## Boundary

T4 closes the OpenAPI/generated-client layer only. Web ledger UX, ledger reads/reports, period lifecycle beyond OPEN creation, invoices/payments/expenses/commissions, and Finance workflow integration remain deferred.
