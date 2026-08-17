# EF-233 T1-R2 — Canonical Payment Idempotency

## Status
PASS

## Scope
Executed only `EF-233-T1-R2-CANONICAL-PAYMENT-IDEMPOTENCY`. Changed only:

- `apps/api/src/features/finance/application/receivable-repository.ts`
- `apps/api/src/features/finance/application/receivable-application.ts`
- `apps/api/test/ef233-receivable.application.test.mjs`
- `docs/handoffs/EF-233/T1-R2-canonical-payment-idempotency-executor.md`

## TDD RED evidence
After changing the application tests to remove caller-supplied payload hashes and before the production changes:

```text
pnpm --dir apps/api run build && node --test apps/api/test/ef233-receivable.application.test.mjs
```

The test run exited `1` with four expected failures from the old implementation: it still required `commandPayloadHash` from the caller and did not accept the new scoped repository input.

## Implementation

- Removed `commandPayloadHash` from the application payment command.
- Added deterministic local canonical identity hashing using Node standard-library `node:crypto` SHA-256 over fixed-order JSON fields: organization, receivable, payment, decimal amount, normalized currency, canonical ISO timestamp, and authenticated user.
- Added literal `RECEIVABLE_PAYMENT_RECORD` scope to idempotency resolution and payment mutation intents.
- Kept the existing `PaymentRecord.commandPayloadHash` persistence-facing field, populated only from the locally derived identity.
- Preserved ordering: authorize → validate idempotency key → derive identity → resolve replay/conflict → scoped receivable lookup → domain transition → mutation intent.
- No persistence implementation, database uniqueness, or concurrency behavior was added.

## Verification evidence

1. `pnpm --dir apps/api run build`
   - Exit `0`; TypeScript build passed.
2. `node --test apps/api/test/ef233-receivable.domain.test.mjs apps/api/test/ef233-receivable.application.test.mjs`
   - Exit `0`; `18` passed, `0` failed, `0` skipped.
3. `git diff --check -- apps/api/src/features/finance/application/receivable-repository.ts apps/api/src/features/finance/application/receivable-application.ts apps/api/test/ef233-receivable.application.test.mjs`
   - Exit `0`; no whitespace errors.

## Test coverage

- Caller application commands contain no payload hash.
- Equal semantic payment commands produce equal derived identities.
- Changed amount, currency, timestamp, payment ID, actor, organization, or receivable produces a different identity.
- Scope and replay ordering are asserted at the repository boundary.
- Existing replay, conflict, authorization, authority lookup, and domain lifecycle tests remain green.

## Guard posture

`clean-code-guard`: clean. `test-guard`: no findings requiring change. No domain, Prisma, schema, migration, DB, HTTP, module, OpenAPI, client, Web, ledger, environment, secret, install, commit, push, or deploy changes were made. Existing unrelated dirty checkout changes were preserved.
