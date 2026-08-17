# EF-232 Web Command Workspace — Independent Verification (2026-08-15)

## Verdict

**PASS — accepted.**

## Scope accepted

Arabic-first, organization-scoped command surface:

```text
/ar/organizations/[organizationId]/finance/commissions
```

It uses the established same-origin browser API client and session CSRF provider to execute only the three T3/T4 commands:

1. Create Commission Plan Version.
2. Capture Commissionable Value.
3. Create Expected Accrual.

It is intentionally **not** a finance dashboard or a commission read/list/lifecycle surface: it shows no balances, persisted lists, payable actions, ledger posting, invoices, payments, reports, Deal mutation, or Lead mutation.

## Transport and client boundaries

- All mutations flow through the Web `ApiClient`, relative `/api`, cookie credentials, request ID, and CSRF token.
- No UI-owned `fetch`, server imports, ORM/repository/domain imports, invented idempotency header, or token storage was introduced.
- Adapter validates organization and deal path identifiers before creating/requesting paths. Invalid contexts and malformed DTOs produce zero network calls.
- Plan input is default `{ version }` or complete `{ version, rateBps, recipients }`; half-policy, unexpected fields, invalid sequence/kind/split total, malformed UUID/money/currency/timestamp are rejected preflight.
- The success surface recognizes EF-232's real `replayed` result kind only, rather than the unrelated Leads `idempotent-replay` alias.

## Fresh independent gate

```text
Web lint: PASS
Web typecheck: PASS
Web tests: 38/38 PASS
Next production build: PASS
git diff --check: PASS
```

The production build used `API_ORIGIN=http://127.0.0.1:3000` solely as a non-secret loopback rewrite configuration value. It did not start an API, issue a live request, mutate a database, or deploy. The build enumerated the dynamic commission workspace route successfully.

## Explicit deferrals

No Commission query/read model, expected→confirmed→due→paid/cancelled lifecycle, ledger posting, invoice/receivable/payment, expense, report/export, automation, API/schema/migration, generated client change, deployment, or credential access is accepted in this Web packet. EF-233 begins as a separate receivable/invoice domain contract.
