# EF-231 T2-R2 — Independent Period-Creation Verification (2026-08-14)

## Verdict

**PASS — accepted as a prerequisite completion inside the EF-231 T2 persistence boundary.**

## Independent evidence

All mutable verification used only the guarded test target.

```text
Test DB guard                                                       PASS
Prisma generate                                                     PASS
Prisma migrate deploy: 8 migrations, no pending                    PASS
API build                                                           PASS
EF-231 domain/application/integration + EF-203 serial tests       25/25 PASS
git diff --check                                                   PASS
EF231_T2_PERIOD_DENIAL_PRE_PORT_AND_NO_ROW                        PASS
```

## Proven contract

- `createAccountingPeriod` creates only an `OPEN` period from id, organization, and finite ordered dates; caller cannot set status.
- The application authorizes verified, active `OWNER` and `MANAGER` only, before any typed repository mutation port.
- `BROKER`, `CLIENT`, unverified, inactive, and cross-organization callers are denied.
- Prisma stores exactly one organization-scoped `OPEN` row, maps expected ownership/id conflicts to its typed conflict outcome, and propagates unexpected errors.
- The independent denial probe proves a Broker call makes **zero** repository-port calls and creates **zero** period rows.

## Boundary

No HTTP, module wiring, DTO, OpenAPI/client, Web, migration, commission, invoice, payment, expense, campaign, or outbox behavior was added.

## Next prerequisite

T3 must not accept a caller-supplied AccountingPeriod object for posting. Before HTTP, the application needs a typed organization-scoped period lookup and must post from `periodId` after loading the persisted period. This avoids treating caller-provided range/status fields as authoritative, even though T2 repository validation already protects the final transition.
