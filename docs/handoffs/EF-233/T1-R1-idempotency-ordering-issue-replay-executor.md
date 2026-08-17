# EF-233 T1-R1 — Idempotency Ordering and Issue Replay

## Status
PASS

## Scope
Executed only the approved EF-233 T1-R1 packet. Changed:

- `apps/api/src/features/finance/application/receivable-repository.ts`
- `apps/api/src/features/finance/application/receivable-application.ts`
- `apps/api/test/ef233-receivable.application.test.mjs`
- `docs/handoffs/EF-233/T1-R1-idempotency-ordering-issue-replay-executor.md`

No domain files were modified.

## TDD RED evidence
Added replay-ordering and issued-invoice replay scenarios before production changes, then ran:

```text
node --test apps/api/test/ef233-receivable.application.test.mjs
```

The pre-fix run exited `1` with five expected failures: payment replay was not resolved before domain validation, conflicting replay proceeded to mutation, and ISSUED invoices reached the domain issue transition instead of repository replay resolution.

## Implementation

- Added explicit repository contracts for `resolvePaymentIdempotency(...)` and `findReceivableByInvoice(...)`.
- Added typed payment idempotency results: `absent`, exact `replayed`, or payload `conflict`.
- Payment authorization now resolves the scoped idempotency identity before receivable lookup, domain balance validation, or `recordPayment` mutation.
- Added ISSUED-invoice replay resolution using organization/invoice-scoped receivable facts and semantic checks for actor, issued/due timestamps, ownership, invoice identity, deal identity, and monetary snapshot.
- DRAFT invoices retain the normal domain issue transition and issue mutation port.
- Missing issued replay receivables return typed not-found; mismatched persisted facts return typed conflict.
- No persistence, schema, migration, Prisma, HTTP, module, OpenAPI, client, Web, ledger, database, environment, secret, install, commit, push, or deploy work was performed.

## Verification evidence

1. `pnpm --dir apps/api run build`
   - Exit `0`; TypeScript build passed.
2. `node --test apps/api/test/ef233-receivable.domain.test.mjs apps/api/test/ef233-receivable.application.test.mjs`
   - Exit `0`; `16` passed, `0` failed, `0` skipped.
3. `git diff --check -- apps/api/src/features/finance/application/receivable-repository.ts apps/api/src/features/finance/application/receivable-application.ts apps/api/test/ef233-receivable.application.test.mjs`
   - Exit `0`; no whitespace errors.

## Guard pass

- `clean-code-guard`: clean.
- `test-guard`: changed tests exercise real application/domain objects and repository boundaries; no additional findings.
