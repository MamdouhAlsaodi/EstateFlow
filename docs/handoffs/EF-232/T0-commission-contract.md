# EF-232 T0 — Commission Plan, Accrual, and Payable Contract

## Status

Approved demo policy defaults; **implementation blocked only on commissionable-deal-value authority**.

## Product boundary

EF-232 introduces organization-scoped, versioned commission policy and commission accruals connected to an already-persisted `DEAL_CLOSED_WON` event. It covers expected → confirmed → due → paid/cancelled state policy, split recipients, deterministic rounding, and a configurable maker-checker policy.

It does **not** implement invoices, receivables, payments, expenses, generic ledger reads/reports, automation/outbox delivery, campaign dimensions, Web UI, external payment providers, or accounting/tax certification.

## Approved demo defaults

The seedable/default plan is a policy record—not a hard-coded business rule:

```text
calculation: percentage of commissionable deal value
rate: 5% (500 basis points)
splits:
  broker recipient: 60%
  office recipient: 40%
rounding: integer minor units; after floor allocation, remainder minor units go to the final ordered recipient
maker-checker: policy represented but disabled by default; no threshold amount is invented
```

Plans are immutable after activation. A later change creates a new version; an accrual retains the exact applied plan version and calculated split snapshot.

## Required authority boundary

An accrual consumes only a persisted, organization-scoped `DEAL_CLOSED_WON` event and corresponding persisted Deal. It never trusts a caller-shaped Deal/event object, plan, recipient role, amount, status, or split.

**Current dependency gap:** EF-203 deliberately persisted `DealClosedWon` without price/currency. Therefore a percentage commission has no authoritative `commissionableAmountMinor` or currency to calculate from. EF-232 must not invent a zero amount, infer a price from Property, accept a forged amount during event consumption, or post finance entries without this authority.

## Selected authority design

EF-232 uses an **explicit Owner/Manager commissionable-value capture command** for an existing organization-scoped Deal. It is an auditable financial fact persisted before any accrual. Deal closure remains unchanged; EF-203 is not reopened.

A later accrual command accepts only primitive IDs (`dealId`, `commissionableValueId`, `commissionPlanVersionId`, `dealClosedWonEventId`) and obtains the Deal, the versioned `DEAL_CLOSED_WON` event, the captured value, and plan version through organization-scoped persistence. It may accrue only when every record matches the same organization and captured value's Deal matches the event/Deal. Callers cannot supply aggregate objects, calculated totals, plan splits, recipient roles, or lifecycle state.

## Commission state policy

```text
EXPECTED → CONFIRMED → DUE → PAID
                       ↘ CANCELLED
EXPECTED/CONFIRMED may transition to CANCELLED.
PAID and CANCELLED are terminal.
```

- Expected accrual is calculated from the stored plan and authoritative commissionable value.
- Confirmation must not recalculate or mutate the applied plan/splits.
- A commission reaches `DUE` only after an explicit triggering event.
- When a configured enabled maker-checker policy applies, the required independent approver must differ from the initiating actor; default demo policy is disabled.
- `PAID` is a later EF-233 payment-linked transition; EF-232 defines its state boundary but does not record a payment.

## TDD execution order after authority decision

1. T1 domain/application: plan versioning, percentage/split validation, deterministic minor-unit rounding, state machine, authorization, and persisted authority port.
2. T2 Prisma migration/repository: scoped plan, plan version, commissionable value/event consumption idempotency, accrual/split persistence; guarded `estateflow_test` only.
3. T3 guarded HTTP and request-level authorization/isolation proof.
4. T4 OpenAPI/closed-world generated client and drift proof.
5. T5 Arabic commission workspace only after protected read contract exists.

## Acceptance rules

- Total split amount equals total calculated commission exactly in minor units.
- Duplicate consumption of one event cannot create a second accrual.
- Cross-organization deal/event/plan/recipient IDs cannot reach mutation.
- Broker may see only own commission later; broker cannot create owner-level plan/adjustment commands.
- No hard-coded approval threshold, floating point, or mutable applied policy snapshot.
