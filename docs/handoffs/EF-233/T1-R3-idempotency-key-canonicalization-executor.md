# EF-233 T1-R3 — Idempotency-Key Canonicalization Executor Report

## Status
PASS

## Packet
`EF-233-T1-R3-IDEMPOTENCY-KEY-CANONICALIZATION`

## Allowed paths changed
- `apps/api/src/features/finance/application/receivable-application.ts`
- `apps/api/test/ef233-receivable.application.test.mjs`
- `docs/handoffs/EF-233/T1-R3-idempotency-key-canonicalization-executor.md`

## TDD RED evidence
Tests were added before the production change and executed against the existing build:

```text
node --test apps/api/test/ef233-receivable.application.test.mjs
```

Exit `1`: the new canonical-key scenario failed because the application passed the unnormalized key to the payment boundary. The whitespace-only, non-string, and length-boundary tests remained valid.

## Implementation
- Added a small application-boundary `normalizeIdempotencyKey` helper.
- It rejects non-strings, blank-after-trim values, original values over 200 characters, and canonical values over 200 characters; otherwise it returns one trimmed canonical string.
- `recordPayment` now uses that same canonical string for payload identity hash construction, replay lookup, and domain `PaymentRecord` creation.
- No lifecycle, persistence, repository port, HTTP, domain, schema, or infrastructure behavior was changed.

## Tests added
- Padded and unpadded equivalent keys use the same replay lookup key, payload identity hash, and persisted payment key.
- Whitespace-only and non-string keys reject before repository lookup or mutation.
- Keys over 200 characters reject before repository lookup.
- Existing ordinary replay, conflict, and new-payment behavior remains covered by the suite.

## Verification evidence

1. `pnpm --dir apps/api run build`
   - Exit `0`; TypeScript build passed.
2. `node --test apps/api/test/ef233-receivable.domain.test.mjs apps/api/test/ef233-receivable.application.test.mjs`
   - Exit `0`; `21` passed, `0` failed, `0` skipped.
3. `git diff --check -- apps/api/src/features/finance/application/receivable-application.ts apps/api/test/ef233-receivable.application.test.mjs`
   - Exit `0`; no whitespace errors.

## Guard results
- `clean-code-guard`: clean.
- `test-guard`: no findings requiring change.

## Scope posture
No repository/domain/schema/migration/Prisma/DB/HTTP/module/OpenAPI/client/Web/ledger/env/secrets/install/commit/push/deploy work was performed. Existing unrelated dirty checkout changes were preserved.
