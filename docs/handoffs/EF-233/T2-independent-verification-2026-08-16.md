# EF-233 T2 — Independent Guarded Persistence Verification (2026-08-16)

## Verdict

**PASS — accepted.**

## Accepted database boundary

- Prisma persistence implements organization-scoped Invoice, Receivable, and PaymentRecord facts using composite tenant FKs and unique scoped identities.
- Invoice drafts retain the explicit Owner/Manager amount and currency. Atomic issue transitions the persisted invoice to `ISSUED` and creates exactly one OPEN receivable for that invoice.
- Database constraints enforce positive monetary values, three-letter currencies, receivable balance range and status/balance consistency, due date ordering, one receivable per scoped invoice, and scoped payment idempotency uniqueness.
- A forward-only PostgreSQL migration adds `ef233_reject_issued_invoice_update` / `Invoice_issued_immutability`. Once issued facts exist, direct updates to financial, ownership, issue, due-date, or lifecycle snapshot fields are rejected using `IS DISTINCT FROM`.
- Invoice amendment/cancellation remains deferred. No cancellation command or status-transition policy has been added.

## Durable payment proof

- Payment mutation obtains an authoritative organization-scoped receivable row lock and persists PaymentRecord plus balance/status update together.
- An exact existing canonical idempotency key/hash resolves to the original payment and current receivable; a mismatched canonical identity returns typed `idempotency-payload-conflict`.
- Distinct concurrent payments of `70 + 70` against an outstanding `100` produce exactly one durable payment and one typed conflict, with final outstanding `30` and status `PARTIALLY_PAID`; no raw rejected promise is accepted.
- Three fresh, identical concurrent payment requests before a record exists produce exactly one `recorded` plus two `replayed`, exactly one PaymentRecord, outstanding `70`, and `PARTIALLY_PAID`.
- P2002 recovery is restricted to the precise scoped PaymentRecord uniqueness target (`organizationId`, `commandScope`, `idempotencyKey`), re-resolves canonical replay/conflict, and does not broadly swallow database errors. Unexpected errors continue to propagate.

## Fresh independent final gate

All destructive operations were guarded with `scripts/assert-test-database.mjs` and targeted only `estateflow_test` on loopback port 55433.

```text
Prisma client generation: PASS
Test migration deploy: 11 migrations, no pending migrations
API TypeScript build: PASS
EF-233 guarded integration: 2/2 PASS, repeated 3 times serially
EF-233 T1 domain/application suites: 21/21 PASS
git diff --check: PASS
```

## Explicit deferrals

No HTTP/controller/DTO, OpenAPI/generated client, Web UI, invoice cancellation/amendment, receivable read/aging/dashboard, exports/reminders, payment gateway/bank reconciliation, ledger posting/reversal, commit, push, or deploy is included in this acceptance.
