# EF-231 T2-R5 — Independent Persisted-Account Draft-Command Verification (2026-08-14)

## Verdict

**PASS — accepted. EF-231’s domain/application/persistence authority boundary is now complete for the approved Finance Core ledger commands.**

## Fresh independent evidence

```text
Guarded target: estateflow_test on loopback:55433                   PASS
Prisma generate + migrate deploy (8 migrations, none pending)     PASS
API build                                                          PASS
EF-231 domain/application/integration + EF-203 serial             24/24 PASS
git diff --check                                                  PASS
EF231_T2_ACCOUNT_ID_LOOKUP_PRE_DRAFT_MUTATION                     PASS
```

## Proven command authority

- Account creation accepts command primitives (`id`, `code`, `name`, `type`) and derives organization scope from the authorized command context. It does not accept an authoritative caller Account object.
- Draft creation accepts metadata and primitive line values only: `accountId`, side, bigint minor amount, and currency.
- Authorization occurs before account creation or any account lookup.
- Draft creation resolves every account by the composite organization-scoped `organizationId + accountId` key before constructing a domain draft or invoking the draft mutation port.
- Missing and cross-organization accounts return typed `{ kind: "not-found", resource: "account" }`; the independent probe proves no draft mutation occurs.
- Fewer than two lines reject before lookup. Invalid amount, currency, and side reject before draft mutation.
- Persisted accounts form the only account references in the created draft. Extra forged runtime Account/DraftJournalEntry properties have no authority.
- Account creation maps expected ID/code/ownership constraints to its typed conflict outcome; unexpected persistence errors propagate.

## EF-231 T2 closure within its boundary

T2 now covers the organization-scoped Account, AccountingPeriod, JournalEntry, and JournalLine persistence/application contract: primitive command construction, persisted account/period/entry lookup, balanced posting, posted-entry immutability, and reversal intent. All mutable verification ran exclusively on the guarded test database.

## Deferred

The next phase is **EF-231 T3 — guarded HTTP only**. It must define DTO serialization for bigint minor units (strings over JSON), module/controller wiring, browser session/Origin/CSRF guards, and real guarded request proof. OpenAPI/client and Web remain separate later checkpoints. No commissions, invoices, payments, expenses, reports, period closing/reopening, or external workflows are approved by this acceptance.
