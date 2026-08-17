# EF-203 — Deal and Closed Outcome Contract

## Status

Approved execution contract for EF-203. This document resolves the dependency gap before source changes.

## Product boundary

EF-203 closes a Lead through one explicit outcome command:

- `closeWon`: closes the eligible Lead and atomically creates one Deal.
- `closeLost`: closes the eligible Lead with a required bounded loss reason and does **not** create a Deal.

A close outcome is terminal for EF-203. Reopen, editing a closed reason, generic `PATCH`, a Deal lifecycle beyond creation, Viewings, reminders, notifications, ledger posting, commission calculation, receivables, and external integrations are excluded.

## Model decision

The current EF-202 Lead stages (`NEW`, `CONTACTED`, `QUALIFIED`, `NURTURING`) remain active stages. EF-203 adds terminal stages:

```text
CLOSED_WON
CLOSED_LOST
```

Only `QUALIFIED` or `NURTURING` may close. Terminal Leads cannot receive active-stage transitions, owner changes, next-action changes, Notes, or Tasks. This keeps the P0 rule intact: active Leads have an owner and next action; closed Leads have an intentional outcome.

## Deal creation contract

A won close creates exactly one Deal with:

```text
id, organizationId, leadId, propertyId, brokerId,
status=OPEN, version=1, createdAt, updatedAt
```

- `leadId` is organization-scoped and unique: one Deal per Lead.
- `propertyId` is required and must refer to an ACTIVE Property in the same organization.
- `brokerId` is required and must refer to an active `BROKER` membership in the same organization.
- No price, currency, commission, invoice, receivable, payment, or financial amount exists in EF-203.
- A Deal is created only by `closeWon`; there is no generic Deal create route.

## Campaign decision

The roadmap requests a Campaign link, but no Campaign aggregate or tenant-scoped persistence exists until EF-401. EF-203 must **not** persist an unchecked opaque `campaignId`. EF-401 will introduce the Campaign relation and backfill/associate Deals only through an organization-scoped contract. Existing Lead UTM remains the provenance available in EF-203.

## Events and timeline

The close transaction appends exactly one allowed Lead timeline event:

- `LEAD_CLOSED_WON`: `{ dealId, propertyId, brokerId }`
- `LEAD_CLOSED_LOST`: `{ reason }`

A won close also persists a versioned internal `DealClosedWon` domain event:

```text
schemaVersion: 1
organizationId, dealId, leadId, propertyId, brokerId, occurredAt
```

It is a durable event record for later EF-231 commission/accrual and EF-302 outbox work. It does not invoke Finance, queues, or external effects in EF-203.

## Authorization, idempotency, and errors

- Actor must be verified and have active Owner/Manager/Broker membership in the same organization.
- `Idempotency-Key` is required. Same command/replay returns the original outcome without a second Deal, event, or timeline row; same key with different payload returns typed idempotency conflict.
- Lead and Property cross-organization/missing access are non-disclosing ownership conflicts; HTTP maps these to `404`.
- Broker invalid/inactive/non-BROKER is a validation/access denial as appropriate; never accept client-provided authority.
- `expectedVersion` is required and stale closes return typed `409` without mutation.

## Execution order

1. T1 domain/application contracts and tests only.
2. T2 schema/migration/repository integration on guarded `estateflow_test` only.
3. T3 guarded HTTP + request-level tenant/idempotency proof.
4. T4 OpenAPI/generated client.
5. T5 Arabic Deal outcome/workspace Web surface.

## Acceptance evidence for EF-203 closure

- Valid/invalid terminal transitions and required lost reason.
- One Deal only for won; no Deal for lost; stale/idempotent/cross-organization behavior.
- Scoped FK and durable versioned event verified in isolated PostgreSQL.
- Request-level unauthenticated/owner/cross-tenant proof.
- Generated OpenAPI/client drift proof, Arabic UI proof, and full canonical regression.
