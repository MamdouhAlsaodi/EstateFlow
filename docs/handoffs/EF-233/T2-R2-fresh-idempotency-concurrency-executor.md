# Role Report — EF-233-T2-R2-FRESH-IDEMPOTENCY-CONCURRENCY

## Status
PASS

## Goal
Prove that three fresh identical payment commands racing before any payment row exists produce one durable payment and two canonical replays, without rejected promises; repair only the Prisma repository race boundary.

## Allowed paths used
- `apps/api/src/features/finance/infrastructure/prisma-receivable.repository.ts`
- `apps/api/test/ef233-receivable.repository.integration.test.mjs`
- `docs/handoffs/EF-233/T2-R2-fresh-idempotency-concurrency-executor.md`

## Files changed
- Added a guarded real-database test that creates a new issued 100-minor receivable, asserts zero prior payments, then submits one exact 30-minor command three times concurrently.
- Repaired repository payment serialization by re-resolving idempotency after the authoritative receivable lock, using read-committed row-lock serialization for payment mutation, bounded serialization retry backoff, and a narrow recognized PaymentRecord uniqueness classifier.
- A P2002 is recoverable only when Prisma reports exactly the `organizationId` + `commandScope` + `idempotencyKey` target; matching rows replay, mismatches conflict, absent rows rethrow. Other constraints/errors propagate. P2034 exhaustion re-resolves canonically; absent idempotency remains the existing typed ownership/state conflict.

## Commands run
- TDD RED after adding the fresh test: `export ALLOW_DESTRUCTIVE_TESTS=1; node scripts/assert-test-database.mjs && node --test --test-concurrency=1 apps/api/test/ef233-receivable.repository.integration.test.mjs`
- Fresh guarded database setup: `node scripts/assert-test-database.mjs`
- `pnpm --dir apps/api run db:generate`
- `pnpm --dir apps/api run db:migrate:test`
- `pnpm --dir apps/api run build`
- Exact serial integration suite: `node --test --test-concurrency=1 apps/api/test/ef233-receivable.repository.integration.test.mjs`
- T1 suites: `node --test --test-concurrency=1 apps/api/test/ef233-receivable.domain.test.mjs apps/api/test/ef233-receivable.application.test.mjs`
- `git diff --check -- apps/api/src/features/finance/infrastructure/prisma-receivable.repository.ts apps/api/test/ef233-receivable.repository.integration.test.mjs docs/handoffs/EF-233/T2-R2-fresh-idempotency-concurrency-executor.md`
- Allowed-path status check: `git status --short -- <three allowed paths>`

## Observed output
- Guard accepted the test-only `estateflow_test` target; no URL/password was printed, saved, or read from dotenv.
- Initial corrected RED execution exposed the pre-repair concurrent `P2034` rejection in the fresh three-way race; the earlier single run was nondeterministically green, so the failure was reproduced by the subsequent fresh guarded run before production edits.
- Final migration output: `No pending migrations to apply.`
- Final build exited `0`.
- Final integration: `2` tests passed, `0` failed, `0` rejected, including the prior distinct-payment R1 scenario and the fresh same-key scenario.
- Final T1 suites: `21` passed, `0` failed.
- `git diff --check` exited `0` with no whitespace errors.

## Verification
- Fresh same-key outcome family: exactly one `recorded`, exactly two `replayed`, zero rejected promises.
- Database proof: exactly one `PaymentRecord` for the receivable; outstanding `70n`; status `PARTIALLY_PAID`.
- R1 distinct 70+70 behavior remains green: one recorded, one typed ownership/state conflict, one durable payment, 30 minor outstanding.
- No broad P2002 swallowing exists at `recordPayment`; only the exact three-column PaymentRecord idempotency uniqueness target is recoverable, and absent/unrelated cases propagate.

## Execution lifecycle
completed; no timeout, cancellation, signal, install, commit, push, deploy, or successor work.

## Touched paths observed
Only the three packet-allowed paths were used for this execution. Existing unrelated dirty checkout changes were preserved.

## Session/resume reference
Not applicable.

## Risks
The repository intentionally retains the existing typed ownership/state conflict family for exhausted serializable contention and overpayment; no new domain/application result type was introduced.

## Documentation impact observed
No product, API, architecture, or operator contract changed. This executor report is the only documentation artifact required.

## Git/publication posture observed
No commit, push, publication, or deploy performed.

## Recommended next human decision
Review the allowed-path diff and fresh guarded evidence; no verifier, repair, publication, or next task is authorized by this report.
