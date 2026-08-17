# EF-233 T0 — Receivable / Invoice / Partial-Payment Contract

**Status:** Accepted product/architecture contract — 2026-08-15
**Scope:** domain authority and lifecycle only. No schema, migration, HTTP, OpenAPI, generated client, Web, ledger posting, payment gateway, bank reconciliation, automation, or deployment.

## Product decision: invoice amount authority

An active **Owner** or **Manager** supplies an explicit `amountMinor` and ISO-4217 `currency` while creating an invoice **draft** for an existing organization-scoped Deal.

This is deliberate:

- Deal has no persisted sale-value authority yet.
- A Commissionable Value represents the commission calculation base; it is not automatically the client receivable.
- The amount is mutable only while the invoice is `DRAFT`; issue snapshots the final amount/currency and makes it immutable.
- The selected contract does not infer monetary value from Lead, Deal, Property, Commissionable Value, Commission Accrual, or client request references other than the new draft's own amount/currency.

No client, Broker, or unauthenticated actor may create, issue, cancel, or record payments in this MVP slice.

## Aggregates and immutable facts

### Invoice

```text
InvoiceStatus = DRAFT | ISSUED | CANCELLED

Invoice {
  id, organizationId, dealId,
  money { amountMinor: bigint, currency },
  status,
  draftCreatedBy, draftCreatedAt,
  issuedBy?, issuedAt?, dueAt?,
  cancelledBy?, cancelledAt?, cancellationReason?
}
```

- Draft creation requires a scoped existing Deal and positive `bigint` minor amount / three-letter currency.
- An issued invoice has a future-or-present `dueAt`, immutable monetary/deal identity, and receives payments.
- A draft may be updated only by Owner/Manager before issue; T1 implements draft creation and issue only. Draft amendment and cancellation commands remain deferred until their authority/reason/audit contract is separately packeted.
- `cancel` is permitted only for an unpaid `ISSUED` invoice in its future slice; no deletion ever occurs.

### Receivable

A receivable is not a caller-created duplicate aggregate. Issuing an Invoice atomically creates exactly one immutable Receivable snapshot:

```text
ReceivableStatus = OPEN | PARTIALLY_PAID | PAID | CANCELLED

Receivable {
  id, organizationId, invoiceId, dealId,
  originalMoney, outstandingMinor,
  status, issuedAt, dueAt
}
```

- `originalMoney` is the invoice issue snapshot.
- `outstandingMinor` is derived only by persisted payment facts: `original - sum(recorded payment amounts)`.
- `OPEN` means zero payments; `PARTIALLY_PAID` means `0 < outstanding < original`; `PAID` means exactly zero.
- A receivable is overdue only as a query-time projection: `status in {OPEN, PARTIALLY_PAID}` and `now > dueAt`. It is not a mutable status.
- No negative balance, overpayment, cross-currency payment, deletion, or direct receivable editing.

### PaymentRecord

```text
PaymentRecord {
  id, organizationId, receivableId,
  money, recordedAt, recordedBy,
  idempotencyKey, commandPayloadHash,
  providerReference?  // deferred field; no gateway behavior in MVP
}
```

- Payment registration is Owner/Manager-only and requires an issued, organization-scoped receivable.
- `amountMinor > 0`; exact same currency as the receivable; `recordedAt` is a valid instant.
- A payment cannot exceed the authoritative outstanding amount at mutation time.
- No gateway transfer, bank reconciliation, refund, edit, delete, or ledger posting exists in EF-233.

## State transitions

```text
DRAFT --issue(dueAt)--> ISSUED
ISSUED --record payment less than outstanding--> PARTIALLY_PAID receivable
ISSUED --record payment equal to outstanding--> PAID receivable
ISSUED --cancel, only unpaid; deferred command--> CANCELLED invoice/receivable
```

- Issue is idempotent by invoice identity only when the already persisted issued snapshot is semantically identical; T1 will define its precise persistence result in the repository contract.
- Repeating a successful payment command with the same `(organizationId, idempotencyKey, command scope)` and equal canonical payload returns the original payment/receivable result without a new row or balance change.
- Reusing that key with a different canonical payload is a typed conflict and causes no mutation.
- Concurrent payments are serialized/guarded at the persistence boundary. At most one resulting sequence may consume the remaining outstanding amount; the loser returns a typed overpayment/state conflict with no row.

## Authorization and tenant isolation

| Operation | Owner | Manager | Broker / Client / other | Cross-tenant or missing ID |
|---|---:|---:|---:|---:|
| Create invoice draft | allow | allow | deny | generic not-found; no mutation |
| Issue invoice | allow | allow | deny | generic not-found; no mutation |
| Record payment | allow | allow | deny | generic not-found; no mutation |

All accepted commands require a verified actor and active membership. Browser session/Origin/CSRF are deferred to guarded HTTP. Domain/application receives authority through organization-scoped repository lookups; it never trusts a caller-provided Deal, Invoice, Receivable, balance, or currency aggregate.

## Exact money and timestamps

- Domain/application accepts `bigint` minor units only; no floats or decimal math.
- HTTP, later, accepts canonical positive decimal strings and serializes bigint as decimal strings.
- Date/time values are valid immutable instants; due-date semantics use exact UTC timestamps in this MVP.

## Planned packets

1. **T1:** domain types/functions + application authorization and typed repository port with focused domain/application tests. No persistence.
2. **T2:** Prisma migration and guarded `estateflow_test` persistence; transactionally issue invoice→receivable and record idempotent/concurrent payments.
3. **T3:** guarded HTTP for only create draft / issue / record payment, after typed-error inventory.
4. **T4:** OpenAPI + canonical generated client, then Web command workspace only after T4 is accepted.
5. **Later separate slice:** invoice cancellation/amendment, ledger posting/reversals, receivable reads/aging, owner dashboard, exports, reminders, gateway/bank reconciliation, and provider references.

## Non-negotiable acceptance invariants for T2+

- organization-scoped composite ownership for Deal → Invoice → Receivable → PaymentRecord;
- one Receivable per issued Invoice;
- only one currency per receivable/payment sequence;
- no payment may take outstanding below zero;
- same idempotency key + same canonical payload has exactly-once durable result;
- same idempotency key + different payload makes no mutation;
- cross-tenant/missing/denied commands make no rows or balance changes;
- BigInt is never JSON serialized raw.
