# EF-232 T4 — Independent OpenAPI / Generated Client Verification (2026-08-15)

## Verdict

**PASS — accepted.**

## Fresh independent gate

```text
API build: PASS
OpenAPI runtime configuration / artifact-preservation: 2/2 PASS
pnpm run generate:openapi: PASS
pnpm run check:openapi-drift: PASS
API client build: PASS
Generated API-client suite: 20/20 PASS
git diff --check: PASS
```

## Accepted contract

T4 adds a closed OpenAPI/generated-client contract for—and only for—the three accepted T3 commands:

1. `CommissionController_createPlanVersion`
   `POST /organizations/{organizationId}/finance/commission-plan-versions` → `201`
2. `CommissionController_captureCommissionableValue`
   `POST /organizations/{organizationId}/finance/deals/{dealId}/commissionable-values` → `201`
3. `CommissionController_createExpectedAccrual`
   `POST /organizations/{organizationId}/finance/deals/{dealId}/expected-commissions` → `201`, or `200` on approved replay.

Each documented organization/deal path parameter is a required UUID. Request schemas are closed-world. `amountMinor` remains a canonical decimal string in the client; no idempotency header was invented.

The plan-version body is a strict two-branch union:

```ts
{ version: number }
| { version: number; rateBps: number; recipients: Recipient[] }
```

OpenAPI uses a closed `oneOf` form, so a half-policy payload cannot match either branch. The generator independently validates this exact shape and rejects both unknown CommissionController operations and a reversion to the permissive `anyOf` contract. Canonical `openapi.json` and `generated.ts` were regenerated only through `pnpm run generate:openapi`.

## Explicit deferrals

T4 accepts no extra runtime command or read/list/report API; no commission lifecycle change; no DB/schema/migration; no ledger posting; no invoice/payment/expense; no Web UI; no automation/outbox; and no Deal/Lead change. The next separate packet may implement the Web workspace solely against this accepted generated client contract.
