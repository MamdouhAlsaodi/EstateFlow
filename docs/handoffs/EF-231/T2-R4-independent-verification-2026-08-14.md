# EF-231 T2-R4 — Independent Persisted-Entry Lookup Verification (2026-08-14)

## Verdict

**PASS — accepted as the final persisted-entry authority prerequisite before an HTTP boundary.**

## Fresh independent evidence

```text
Guarded target: estateflow_test on loopback:55433                   PASS
Prisma generate + migrate deploy (8 migrations, none pending)     PASS
API build                                                          PASS
EF-231 domain/application/integration + EF-203 serial             26/26 PASS
git diff --check                                                  PASS
EF231_T2_ENTRY_ID_LOOKUP_PRE_MUTATION                             PASS
```

## Proven contract

- `LedgerApplication.post` accepts `entryId`, `periodId`, and `postedAt`; it does not take a typed `DraftJournalEntry`.
- `LedgerApplication.reverse` accepts only `entryId`; it does not take a typed `PostedJournalEntry`.
- Authorization precedes either entry lookup. A missing/cross-organization entry returns typed `not-found` and reaches neither posting nor reversal mutation; the independent probe additionally proves it never attempts period lookup.
- `findJournalEntry` is mandatory, uses the composite `organizationId_id` key, and maps persisted entry fields, account-linked lines, money, and posted state into domain values.
- Extra forged runtime `entry` objects cannot control reference, lines, status, or reversal source; operations use the loaded persisted entry.
- A persisted balanced draft posts and a persisted posted entry reverses without altering the original entry.

## Important boundary clarification

T2-R4 closes authority for *existing* entries and periods. It does **not** make the whole ledger HTTP-ready: creating a chart account and creating a draft still accept rich caller-owned domain values in the current application API. A guarded HTTP route must not expose those values as authoritative. The next required pre-HTTP design slice is a bounded chart-account/draft-command contract using IDs and persisted account lookup, not an improvised Finance controller.

No HTTP, DTO, module, OpenAPI/client, Web, schema, migration, commission, invoice, payment, expense, campaign, or outbox behavior was added.
