# EF-231 T2-R3 — Independent Persisted-Period Lookup Verification (2026-08-14)

## Verdict

**PASS — accepted as the final persisted-period authority prerequisite.**

## Independent run

```text
Guarded target: estateflow_test on loopback:55433                   PASS
Prisma generate + migrate deploy (8 migrations, none pending)     PASS
API build                                                          PASS
EF-231 domain/application/integration + EF-203 serial             26/26 PASS
git diff --check                                                  PASS
EF231_T2_PERIOD_ID_LOOKUP_PRE_POST_MUTATION                       PASS
```

## Proven boundary

- Application `post` takes `entry`, `periodId`, and `postedAt`; it no longer accepts an AccountingPeriod as a typed input.
- It authorizes first, confirms entry organization scope, then uses mandatory `findAccountingPeriod(organizationId, periodId)`.
- Missing/cross-organization period resolves to typed `{ kind: "not-found", resource: "accounting-period" }` and does not call the posting mutation port.
- The persisted period—not extra runtime caller fields—is used by domain posting. The regression supplied a forged closed/out-of-range extra period property and proved the persisted `OPEN` period governed the result.
- Prisma performs the lookup exclusively through the composite organization-scoped key and maps exact period fields.

## Remaining prerequisite

For HTTP, posting must also load the persisted journal draft by `entryId` rather than accept a caller-supplied `DraftJournalEntry`. This is a separate T2-R4 authority completion, and will also provide the safe read needed for later reversal by entry ID.
