# EF-233 T4 — Independent Verification

**Date:** 2026-08-17
**Verdict:** PASS

## Accepted boundary

EF-233 now publishes a closed Swagger/OpenAPI and generated-client contract for exactly three previously accepted guarded HTTP commands:

1. Create an invoice draft.
2. Issue an invoice and create its receivable.
3. Record a receivable payment.

No Web UI, new read model, cancellation, reconciliation, gateway, ledger posting, database migration, or domain/application policy change is included.

## Contract proof

- All route identifiers are required UUID path parameters.
- Request bodies are required JSON objects with `additionalProperties: false`.
- `amountMinor` remains a canonical positive decimal string.
- `currency` remains exactly three uppercase letters.
- issue/payment instants retain strict UTC millisecond `Z` patterns.
- invoice/payment identifiers remain server-owned and absent from caller bodies.
- `Idempotency-Key` is documented only for payment and is required with the accepted `1..200` normalized boundary.
- draft documents `201`.
- issue and payment document first-success `201` and exact-replay `200`.
- the generator rejects missing required operations, unsupported fourth Receivable operations, body drift, parameter drift, missing payment idempotency, and missing success statuses.

## Generated client

Official generation produced exactly these methods:

- `createInvoiceDraft`
- `issueInvoice`
- `recordReceivablePayment`

Client verification proves encoded route values, exact JSON bodies, decimal-string money, and an `Idempotency-Key` header on payment only.

The official generator was also corrected to pass the generated `.ts` filepath to Prettier. This makes `pnpm run generate:openapi` produce the same workspace-formatted TypeScript checked by the drift gate, without a manual formatting step.

## Verification evidence

```text
Focused EF-233 OpenAPI contract: 1 pass, 0 fail
Global OpenAPI inventory/contract: 1 pass, 0 fail
Generated API client: 23 pass, 0 fail
Official OpenAPI generation: PASS
OpenAPI drift: PASS
Workspace format: PASS
Workspace lint/boundary/infrastructure: PASS
Workspace typecheck: PASS
API tests: 262 pass, 0 fail, 19 guarded integration skips
Web tests: 38 pass, 0 fail
Design-token tests: 2 pass, 0 fail
Production workspace build with API_ORIGIN: PASS
Web production build: PASS
git diff --check: PASS
```

Database-backed EF-233 HTTP/persistence verification remains recorded under T2/T3 evidence and was not rerun by the non-database T4 contract slice.

## Acceptance

EF-233 T4 is accepted. The next boundary is the Arabic organization-scoped Web command workspace for the three accepted invoice/receivable/payment commands. It must consume the generated client contract and must not add finance reads or expand domain policy implicitly.
