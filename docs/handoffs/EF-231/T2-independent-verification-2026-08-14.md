# EF-231 T2 — Independent PostgreSQL Persistence Verification (2026-08-14)

## Verdict

**PASS — EF-231 T2 is accepted within the guarded Prisma/PostgreSQL persistence boundary.**

## Fresh independent evidence

All database activity was preceded by the destructive-test guard and ran only against `estateflow_test` on loopback port `55433`.

```text
Test DB guard                                                     PASS
Prisma generate                                                   PASS
Prisma migrate deploy: 8 migrations, no pending                  PASS
API build                                                         PASS
EF-231 + EF-203 serial repository integrations                  6/6 PASS
git diff --check                                                 PASS
```

## Persistence contract proved

- Account / AccountingPeriod / JournalEntry / JournalLine are organization-scoped with composite foreign keys and restrictive references.
- Database enforces positive line amounts and valid period date ranges.
- Chart code is unique within an organization and can repeat across organizations.
- Valid drafts persist exact `bigint` amounts, debit/credit sides, currencies, account links, and organization scope.
- Posting only transitions a persisted owned `DRAFT`; a second post rejects and lines remain unchanged.
- Closed and cross-organization periods reject without partial transition.
- A reversal persists separately with swapped lines and `reversalOfEntryId`; its original posted entry remains unchanged.

## Recovery and decisive regression

The initial T2 implementation was **not accepted** because an independent guarded probe showed that a stored unbalanced draft could be posted by providing a forged balanced in-memory payload:

```text
EF231_T2_FORGED_POST_ACCEPTED=OBSERVED
```

T2-R1 changed `PrismaLedgerRepository.post` to read the stored entry and its stored lines inside the posting transaction, then verify line count, currency, positive amount, and exact bigint debit/credit equality before `updateMany`.

The original reproduction was rerun independently after the recovery:

```text
EF231_T2_FORGED_POST_REJECTED_AND_DRAFT_PRESERVED=PASS
```

It proves the forged payload is rejected and the stored entry retains `status=DRAFT`, `postedAt=null`, and `periodId=null`.

## Deferred

T2 does not include module wiring, HTTP/DTO/OpenAPI, generated API client, Web, durable idempotency, period reopening/audit, or any commission/invoice/payment/expense/campaign/outbox behavior. The next boundary is EF-231 T3 guarded HTTP only.
