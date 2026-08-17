# EF-232 T3 — Independent Guarded Commission HTTP Verification (2026-08-15)

## Verdict

**PASS — accepted.**

## Fresh independent gate

```text
Destructive test database guard: estateflow_test on loopback:55433 PASS
Prisma generate: PASS
Prisma migrate deploy: 9 migrations; no pending migrations
API build: PASS
EF-232 static HTTP contract: 5/5 PASS
EF-232 guarded real HTTP integration: 1/1 PASS
EF-232 domain/application/repository + EF-231 guarded HTTP regression: 23/23 PASS
git diff --check: PASS
```

## Accepted HTTP boundary

Exactly three protected POST commands exist, each guarded in this order: canonical Origin → browser session → CSRF.

1. `POST /organizations/:organizationId/finance/commission-plan-versions`
2. `POST /organizations/:organizationId/finance/deals/:dealId/commissionable-values`
3. `POST /organizations/:organizationId/finance/deals/:dealId/expected-commissions`

All organization/deal IDs use `ParseUUIDPipe`. DTOs are closed-world and validate canonical UUIDs, integer policy values, 3-letter currency, canonical UTC timestamps, complete plan policy, and positive canonical decimal-string minor money. The transport adapter converts money to bigint only after validation and serializes all returned bigint values as decimal strings.

Owner and Manager are proven through real guarded HTTP. A Broker is denied. Missing session is `401`; bad Origin/missing CSRF are `403` without mutation; malformed payload is `400`; missing/cross-tenant authority is opaque `404` without row growth; persistence conflicts are `409`; successful create is `201`; same authority tuple replay is `200` and leaves a single persisted accrual/split set.

The response serializer now explicitly returns a transport-safe shape rather than casting serialized data back to a domain-result generic type.

## Regression repair carried by this gate

EF-231 guarded ledger HTTP integration contained an assertion that inferred business ordering from random UUID sorting. EF-231 R1 replaces that assertion with semantic source/reversal multisets: two lines per entry, preserved account/amount/currency, one debit + one credit per entry, opposites across source/reversal, source POSTED and reversal DRAFT. The independent 23-test financial regression gate passed after that correction.

## Explicit deferrals

No commission read/list/report API, lifecycle confirmation/due/paid/cancel, ledger posting, invoice/payment/expense, OpenAPI annotations/artifacts, generated client, Web UI, schema/migration, Deal/Lead change, outbox, or automation is accepted in T3. T4 owns only the OpenAPI/generated-client boundary for these exact three commands.
