# EF-231 T0 — Ledger Contract

## Scope

EF-231 establishes an organization-scoped, double-entry ledger foundation. It is the only finance slice being opened now. It does not implement commissions, invoices, payments, expenses, reports, Deal event consumption, campaign dimensions, outbox, HTTP, OpenAPI, or Web UI.

## Value objects and entities

- **Money:** `{ amountMinor: bigint; currency: string }`. Amounts are integer minor units only; floats, unsafe numbers, zero, and invalid ISO-style three-letter currency codes are rejected.
- **Account:** organization-scoped chart-of-accounts record with a stable id, unique canonical code, bounded name, and one of `ASSET`, `LIABILITY`, `EQUITY`, `REVENUE`, `EXPENSE`.
- **JournalLine:** exactly one side (`DEBIT` or `CREDIT`), positive Money, and a chart account belonging to the entry organization.
- **JournalEntry:** `DRAFT` or `POSTED`; has at least two lines, a single currency, bounded reference/reason, actor, organization, created/posting time, and optional reversal-of entry id.
- **AccountingPeriod:** organization-scoped `[startsAt, endsAt]` with `OPEN` or `CLOSED` status. A posting date belongs to exactly one supplied period; ordinary posting into a closed period is rejected.

## Invariants

1. A journal entry can be posted only when it has at least two lines, all lines share one currency, and the sum of debit minor units exactly equals the sum of credit minor units.
2. Posted entries are immutable. There is no domain edit transition from `POSTED` back to `DRAFT`.
3. A correction is a separate draft reversal of a posted entry: same accounts and currency, debit/credit sides swapped, and a required `reversalOfEntryId`. The reversal must itself pass normal posting validation.
4. Organization IDs on entry, accounts, and period must match; cross-organization references are rejected before a posting intent is made.
5. The application layer authorizes only verified active `OWNER` or `MANAGER` membership for journal commands. It returns typed access/ownership/period/balance validation results without persistence casts or dynamic ports.
6. This slice creates explicit typed repository ports only; persistence and idempotency durability are deferred to EF-231 T2.

## Deferred deliberately

- Persistence transaction/migration and unique chart-code enforcement: EF-231 T2.
- HTTP, OpenAPI/generated client, Web: later EF-231 slices.
- Independent period reopening authorization/review/audit: persistence/API slice after a concrete audit model exists.
- Commission accrual, invoices/payments, expenses, financial dimensions and external effects: EF-232 through EF-235.

## Acceptance for T1

Domain/application tests prove: Money rejects invalid representations and currencies; mixed currencies and unbalanced lines cannot post; valid balanced entries post once; posted entries cannot be edited; reversal swaps sides and points to the original; closed/missing/cross-organization period is rejected; and unauthorized actors never reach repository mutation ports.
