# EF-233 T1 — Independent Domain / Application Verification (2026-08-15)

## Verdict

**PASS — accepted.**

## Accepted boundary

- Invoice drafts receive explicit Owner/Manager amount/currency only after a scoped persisted Deal lookup.
- `DRAFT → ISSUED` requires a valid due instant and returns an immutable one-to-one OPEN receivable snapshot.
- Payments operate in `bigint` minor units, require matching currency, and transition `OPEN → PARTIALLY_PAID → PAID` without a negative balance or overpayment.
- Authoritative existing facts are repository-loaded by organization scope; Broker/Client/unverified/inactive commands are denied before lookups and missing/cross-tenant resources produce generic typed not-found without mutation intent.
- Typed validation/state errors are transport-neutral prerequisites for later guarded HTTP.

## Replay / idempotency proof

- Payment replay resolution is ordered before current receivable balance validation; an exact persisted replay returns the original payment/receivable even after the current outstanding amount reaches zero.
- Same key with a different canonical payment identity yields a typed conflict before authority lookup or mutation.
- Invoice issue replay resolves the organization-scoped invoice and receivable snapshot. Only matching actor, issue time, due time, invoice/receivable ownership, deal identity, amount, and currency returns replay; mismatch returns conflict.
- `commandPayloadHash` cannot be provided by the application caller. The application derives deterministic SHA-256 identity from organization, receivable, payment ID, decimal minor amount, normalized currency, UTC instant, authenticated actor, and canonical idempotency key.
- The `Idempotency-Key` is normalized once at the application boundary and the same canonical value is used in hash construction, repository resolution, and PaymentRecord. Blank/non-string/overlong keys fail before any repository call.
- Repository contracts use explicit `RECEIVABLE_PAYMENT_RECORD` scope; no optional/dynamic port, in-memory idempotency, or persistence implementation exists in T1.

## Fresh independent gate

```text
API TypeScript build: PASS
EF-233 domain/application suites: 21/21 PASS
git diff --check: PASS
```

## Explicit deferrals

T1 includes no schema/migration/Prisma implementation, database action, concurrency/durable uniqueness proof, HTTP, DTO, OpenAPI/client, Web, ledger posting, invoice amendment/cancellation, read/aging/dashboard, exports, gateway/bank reconciliation, deployment, or credentials. These remain out of scope until their separate packets.
