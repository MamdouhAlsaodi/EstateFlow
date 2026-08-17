# EF-231 T3 — Independent Guarded Ledger HTTP Verification (2026-08-14)

## Verdict

**PASS — accepted within the five-command HTTP boundary.**

## Fresh guarded execution

```text
Destructive test database target accepted: estateflow_test on loopback:55433.
Prisma generate: PASS
Prisma migrate deploy: PASS — 8 migrations, no pending
API TypeScript build: PASS
Finance + EF-203 selected suites: 32/32 PASS
git diff --check: PASS
```

## Accepted routes

- `POST /organizations/:organizationId/finance/accounts` — 201
- `POST /organizations/:organizationId/finance/accounting-periods` — 201
- `POST /organizations/:organizationId/finance/journal-drafts` — 201
- `POST /organizations/:organizationId/finance/journal-entries/:entryId/post` — 200
- `POST /organizations/:organizationId/finance/journal-entries/:entryId/reverse` — 201

All use canonical-origin, browser-session, and CSRF guards; route identifiers are UUID-validated. Finance application authorization allows only active Owner/Manager membership.

## Behavior evidence

- Full real HTTP lifecycle passed: account, period, balanced draft, post, then UUID reversal.
- Reversal is a DRAFT linked to the POSTED source; the pair persists four lines with inverse debit/credit sides, while the source remains POSTED.
- No session returns 401; Broker returns 403; duplicate account returns 409; malformed amount/extra DTO/post-state returns 400.
- A user with active membership in both organizations receives generic 404 for a foreign entry addressed under the primary organization. Response body contained no IDs, organizations, account/period identifiers, text, amounts, currency, or journal sides; entry/line counts did not change.
- `amountMinor` accepts canonical positive decimal strings only and responses serialize monetary bigint values as strings.

## Deferred boundary

`node scripts/check-openapi-drift.mjs` exited `1` with empty stdout/stderr. This is **deferred, not PASS**: T3 intentionally did not edit OpenAPI, generated client artifacts, or Web. Those belong to an independently gated T4.

## Exclusions retained

No ledger read/list routes, updates/deletes, accounting-period close/reopen, idempotency, reports, commissions, invoices, payments, expenses, outbox, OpenAPI/client, or Web scope was added.
