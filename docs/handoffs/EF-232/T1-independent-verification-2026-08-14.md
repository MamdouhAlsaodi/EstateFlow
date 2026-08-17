# EF-232 T1 — Independent Commission Domain / Application Verification (2026-08-14)

## Verdict

**PASS — accepted.**

## Scope

T1 adds only pure commission domain/application contracts and focused tests. It does not touch the schema, database, HTTP, OpenAPI/client, Web, module wiring, ledger posting, invoices/payments/expenses, Deal/Lead behavior, or external effects.

## Fresh independent verification

```text
API build: PASS
EF-232 + EF-231 domain/application tests: 32/32 PASS
git diff --check: PASS
EF232_T1_INDEPENDENT_AUTHORITY_AND_ROUNDING=PASS
```

## Reviewed invariants

- Default immutable plan: 500 basis-point rate; ordered broker `6000` then office `4000` split basis points.
- Calculations use `bigint` only. Accrual total is `floor(valueMinor * rateBps / 10000)`; each allocation is floored and residual minor units are assigned to the final ordered recipient.
- The independent residual probe used a value of `20` minor units, yielding one commission minor unit allocated `[0, 1]` to broker/office respectively.
- Commissionable value is a positive Money fact captured by Owner/Manager for an already persisted, organization-scoped Deal.
- Expected accrual takes primitive IDs at application boundary and uses persisted Deal, `DEAL_CLOSED_WON` v1 event, captured value, and plan version. Forged caller totals/splits/status do not affect it.
- Authorization precedes all lookup/mutation. Owner/Manager only; Broker denial makes no repository call. Missing or cross-organization Deal/event/value/plan returns typed not-found and makes no mutation.
- Lifecycle and maker-checker policy are typed. Default policy is disabled; enabled policy requires an approver different from the capture actor. No threshold or ledger posting was invented.

## Next boundary

EF-232 T2 may add only schema/migration and atomic Prisma persistence on guarded `estateflow_test`, including organization-scoped authority lookup and duplicate-event accrual prevention. HTTP, OpenAPI/client, Web, invoice/payment/expense, and ledger posting remain later bounded work.
