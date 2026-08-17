# EF-232 T2 — Independent Guarded Persistence Verification (2026-08-15)

## Verdict

**PASS — accepted.**

## Fresh independent gate

```text
Destructive DB guard: estateflow_test on loopback:55433 PASS
Prisma generate: PASS
Prisma migrate deploy: 9 migrations; no pending migrations
API build: PASS
EF-232 guarded real persistence integration: 1/1 PASS
EF-232 domain/application + EF-231 repository regression: 18/18 PASS
git diff --check: PASS
```

## Accepted durable boundary

- Migration nine persists organization-scoped plan versions and ordered recipient snapshots, one commissionable value per Deal, expected accruals, and immutable accrual splits.
- Composite organization-scoped foreign keys bind every related finance authority; database constraints enforce money/currency, recipient, order, plan-rate, status, and tenant integrity.
- Owner/Manager application commands remain primitive-ID/primitive-value boundaries; repository reloads persisted Deal, v1 `DEAL_CLOSED_WON` event, captured value, and plan before accrual mutation.
- The commission calculation/split snapshot remains bigint-based. A real persisted 20-minor value produces 1 commission minor unit split `[0, 1]` in ordered Broker/Office recipients.
- Sequential and concurrent same-event calls create exactly one accrual/split set. The creator returns `created`; all competing/repeated valid calls return the stored `replayed` accrual, including P2002 event-unique recovery after scoped authority tuple matching.
- Missing/cross-tenant/mismatched authorities, wrong event type, schemaVersion 2, and valid event/value records belonging to another Deal return typed conflict without row growth.

## Scope

T2 did not add HTTP, controller/DTO, OpenAPI/client, Web, generic reads/reports, payment/invoice/expense, ledger posting, Deal/Lead source changes, or automation/outbox behavior.

## Next boundary

EF-232 T3 may expose only the approved plan creation, commissionable-value capture, and expected-accrual commands through guarded HTTP. It must preserve the existing owner/manager authorization and tenant non-disclosure contract; reads, lifecycle transitions, OpenAPI/client, and Web remain separately gated.
