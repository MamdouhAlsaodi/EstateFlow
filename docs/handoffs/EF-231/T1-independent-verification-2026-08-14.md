# EF-231 T1 — Independent Domain/Application Verification (2026-08-14)

## Verdict

**PASS — accepted within the domain/application boundary.**

This acceptance covers only the EF-231 ledger contract: Money, organization-scoped Chart of Accounts records, balanced journal drafts/posting, immutable posted entries, reversal intent, period policy, and typed application authorization ports. It does **not** accept persistence, migrations, HTTP/OpenAPI, Web, or later Finance workflows.

## Independent fresh evidence

```text
pnpm --dir apps/api run build                                      PASS
node --test EF-231 domain/application                              13/13 PASS
runtime probe: invalid Account.type rejected                       PASS
runtime probe: Invalid Date period start rejected                  PASS
runtime probe: cross-org command reaches 0 repository ports        PASS
git diff --check (Finance T1 scoped paths)                         PASS
```

## Acceptance mapped to contract

| Contract requirement | Evidence |
|---|---|
| Positive bigint minor-unit Money and canonical currency | Domain test: invalid amount representations/currencies rejected; lowercase canonicalized. |
| Chart account scope/type | Domain test + runtime probe reject unsupported Account type; cross-org account rejected in draft. |
| Double-entry draft/posting | Domain tests reject <2 lines, mixed currencies, invalid side/amount, unbalanced entries; balanced entry posts. |
| Posted immutability | Reposting a posted entry rejects; returned posted entry is frozen. |
| Reversal | Domain test verifies a separate draft with swapped debit/credit sides and original reference. |
| Period policy | Missing, closed, foreign, outside, invalid-date, and reversed-range periods reject. |
| Authorization/tenant boundary | OWNER/MANAGER may reach mandatory ports; BROKER/CLIENT/unverified/inactive/cross-org commands are denied before repository calls. |
| Scope/provenance | T1 baseline recorded all seven target deliverables absent; T1-R1 checksum baseline recorded repair paths; only allowed Finance T1 paths/reports exist; no DB/HTTP/Web paths. |

## Recovery disposition

The original T1 worker result was not accepted immediately. Independent probes found two runtime gaps: unsupported account types and invalid period start dates were accepted. T1-R1 added test-first validation; the same probes now reject those inputs.

## Deferred and required next boundary

EF-231 T2 must add Prisma schema/migration and atomic PostgreSQL repository behavior on guarded `estateflow_test`, including chart-code uniqueness and durable mutation semantics. It must not add HTTP/OpenAPI/Web or commissions/invoices/payments/expenses.
