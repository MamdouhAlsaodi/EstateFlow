# EF-233 T5 — Invoice Cancellation and Receivable Aging Contract

**Date:** 2026-08-17
**Status:** APPROVED CONTRACT
**Authorities:** FIN-03 in `docs/PRD.md`; EF-233 in `docs/DEVELOPMENT_PLAN.md`; Mamdouh approval on 2026-08-17.

## Goal

Close the two missing EF-233 requirements without widening into refunds, reminders, gateway behavior, ledger automation, exports, or dashboard aggregation.

## A. Invoice cancellation

### Command

```text
CancelInvoice
organizationId: UUID
invoiceId: UUID
actor: verified Owner or Manager with ACTIVE membership
cancelledAt: strict UTC instant
reason: trimmed non-empty text, maximum 500 Unicode code points
```

The server owns cancellation identity and persisted actor identity. The caller cannot submit organization ownership, invoice snapshot fields, receivable balance, payment count, status, or audit actor fields in the body.

### Preconditions and outcomes

1. Authorization runs before resource lookup.
2. Missing or cross-organization invoice returns opaque `not-found`/HTTP `404`.
3. Only `ISSUED` invoices can transition to `CANCELLED`.
4. The invoice must have exactly one organization-scoped receivable.
5. Cancellation is allowed only when:
   - receivable status is `OPEN`;
   - `outstandingMinor === originalMoney.amountMinor`;
   - no persisted payment exists for the receivable.
6. `cancelledAt` must be at or after the persisted `issuedAt` instant.
7. Any partial or full payment blocks cancellation with typed conflict/HTTP `409`.
8. A `DRAFT` invoice is not cancelled by this command; destructive draft deletion remains outside this contract.
9. A first valid cancellation atomically changes:
   - invoice status `ISSUED → CANCELLED`;
   - receivable status `OPEN → CANCELLED`;
   - preserves outstanding amount and every financial snapshot field;
   - records `cancelledBy`, `cancelledAt`, and canonical `cancellationReason` on the invoice.
10. Domain/persistence exact replay compares the persisted actor, time, and canonical reason.
11. The HTTP request does not accept `cancelledAt`; server time is authoritative. A retry against an already-cancelled invoice is request-equivalent when actor and canonical reason match, and reuses the persisted `cancelledAt` for the exact domain replay check.
12. A changed actor or reason against an already-cancelled invoice returns typed conflict/HTTP `409`.
13. Two simultaneous equivalent cancellation requests may resolve as one cancellation and one conflict while both observe the pre-cancel snapshot; a subsequent retry resolves against the persisted snapshot.
14. Cancellation cannot delete or mutate a payment record.
15. Cancelled invoices/receivables cannot accept payments or return to an active state.

### Immutability rule

The PostgreSQL issued-snapshot trigger must continue rejecting changes to amount, currency, organization, Deal, draft metadata, issue metadata, and due date. It may allow exactly one status transition `ISSUED → CANCELLED` accompanied by first-write cancellation audit fields. Every later update remains rejected.

### Cancellation HTTP boundary

```text
POST /organizations/:organizationId/finance/invoices/:invoiceId/cancel
body: { "reason": string }
```

- Owner/Manager only; missing/cross-tenant invoice or receivable returns `404`.
- Guards: `RequireCanonicalOriginGuard`, `BrowserSessionGuard`, `CsrfGuard`.
- First cancellation and exact request retry return `200`.
- The body is closed; reason is trimmed, non-empty, and at most 500 Unicode code points.
- The authenticated actor and server UTC instant are never caller-controlled fields.

## B. Receivable aging

### Read model

Aging is derived at query time; no `OVERDUE` status or elapsed-day counter is persisted.

```text
GetReceivableAging
organizationId: UUID
asOf: server-owned UTC instant
actor: verified Owner or Manager with ACTIVE membership
```

Each active outstanding row exposes only approved fields:

```text
receivableId
invoiceId
dealId
currency
originalAmountMinor: decimal string
outstandingMinor: decimal string
dueAt: UTC ISO string
daysPastDue: non-negative integer
bucket: CURRENT | DAYS_1_30 | DAYS_31_60 | DAYS_61_90 | DAYS_91_PLUS
```

### Computation

- `PAID` and `CANCELLED` receivables are excluded.
- At `asOf <= dueAt`, bucket is `CURRENT` and `daysPastDue = 0`.
- At `asOf > dueAt`, `daysPastDue = ceil((asOf - dueAt) / 24 hours)`.
- Bucket boundaries are inclusive:
  - 1–30 → `DAYS_1_30`
  - 31–60 → `DAYS_31_60`
  - 61–90 → `DAYS_61_90`
  - 91+ → `DAYS_91_PLUS`
- Computation uses UTC instants and is unaffected by process locale or daylight-saving changes.
- Results are ordered by `dueAt ASC`, then `receivableId ASC`.
- Reads are organization-scoped in the database query; cross-tenant rows must never be loaded and filtered in memory.
- Money remains bigint internally and decimal strings over HTTP/JSON.

### Pagination

The first aging read is bounded to a maximum of 100 rows with an opaque stable cursor over `(dueAt, receivableId)`. No unbounded finance query is allowed.

### Aging HTTP boundary

```text
GET /organizations/:organizationId/finance/receivables/aging?limit=50&cursor=<opaque>
```

- Owner/Manager only; `BrowserSessionGuard`; no CSRF guard on this safe read.
- `limit` defaults to 50 and is bounded to 1..100.
- The application asks persistence for `limit + 1`, classifies rows against one server-generated `asOf` instant, and returns `{ asOf, items, nextCursor }`.
- Items expose approved identifiers, original/outstanding exact money, persisted status/issue/due instants, `daysPastDue`, and bucket.
- `nextCursor` is opaque base64url encoding of an exact versioned payload containing the last returned `dueAt` and receivable ID. Invalid version, shape, UTC instant, UUID, or encoding returns `400` before repository read.
- Client-supplied `asOf` is unsupported.

## C. Slice order

- T5A: domain/application RED→GREEN for cancellation and aging classification.
- T5B: guarded Prisma migration/repository with atomic cancellation and scoped stable aging query.
- T5C: guarded HTTP cancellation/read routes and runtime tenant tests.
- T5D: exact Swagger/OpenAPI and generated typed client.
- T5E: Arabic Web cancellation/aging workspace with no optimistic financial state.
- T5V: independent verification, traceability update, full gate, and FIN-03 closure decision.

No later slice may relax this contract without a separately recorded product decision.
