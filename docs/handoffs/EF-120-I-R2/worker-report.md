# Role Report — EF-120-I-R2

## Status
PASS

## Goal
Fix the reproduced auth primitive assertion failure and enforce the approved Argon2 constructor policy floor while retaining bounded legacy-envelope verification.

## Allowed paths used
- `apps/api/src/features/auth/infrastructure/node-crypto-password-hasher.ts`
- `apps/api/test/auth.primitives.test.mjs`
- `docs/handoffs/EF-120-I-R2/worker-report.md`

## Files changed
- `apps/api/src/features/auth/infrastructure/node-crypto-password-hasher.ts` — split safe stored-envelope validation from approved constructor-policy validation; the constructor now rejects values below the EF-120 baseline while verification continues to use bounded envelope validation.
- `apps/api/test/auth.primitives.test.mjs` — replaced the case-sensitive error-message matcher with an `Error` matcher; added real Argon2id legacy-envelope verification/rehash coverage and constructor floor/higher-policy behavior coverage.
- `docs/handoffs/EF-120-I-R2/worker-report.md` — this handoff.

## Commands run
1. `pnpm --dir apps/api run test` (initial reproduction)
2. `pnpm --dir apps/api run test` (RED test run after test changes)
3. `pnpm --dir apps/api run test` (post-repair verification)
4. `node --test apps/api/dist/bootstrap/config.test.js`
5. `pnpm --dir apps/api run typecheck`
6. `pnpm lint`
7. `git diff --check`

## Observed output
1. Initial reproduction exited `1`: 11 passed / 1 failed. `auth.primitives.test.mjs` failed only because `/invalid password hash policy/` did not match `Error: Invalid password hash policy` by case.
2. RED run exited `1`: the repaired message-insensitive assertion passed; the new constructor-floor test failed with `Missing expected exception (Error)`, proving lower bounded memory/iteration/tag policies were accepted before the production repair. Legacy-envelope verification and `needsRehash` behavior passed.
3. Post-repair package test exited `0`: 14 passed / 0 failed.
4. Config test exited `0`: 1 passed / 0 failed.
5. Typecheck exited `0`. Its declared script ran `prisma generate` and `tsc --noEmit`; Prisma client generation completed and TypeScript produced no errors.
6. Root lint exited `0`: ESLint completed with zero warnings; workspace and infrastructure contract checks reported passed.
7. `git diff --check` exited `0` with no output.

## Verification
- Case-insensitive assertion behavior: verified by the post-repair package test.
- Exact default envelope and async Argon2id hash/verify behavior: verified by `Argon2id hashes retain policy parameters and verify without plaintext persistence`.
- Bounded legacy lower memory/iteration/tag envelope verification plus `needsRehash`: verified by `Argon2id verification accepts bounded legacy hashes and marks them for rehash`.
- Each below-baseline constructor field (memoryKiB, iterations, parallelism, saltBytes, tagBytes) rejects; higher bounded policy accepts: verified by `Argon2id constructor enforces the approved policy floor`.
- All packet-declared verification commands exited `0` in this phase.
- `clean-code-guard: clean` — validation responsibilities are explicitly separated, no new abstraction/dependency/error swallowing was introduced, and the changed code remains within existing style and complexity limits.
- `test-guard: clean` — tests assert public constructor/hash/verify/needsRehash behavior with no mocks; the constructor variants are data-driven in one loop, and the legacy envelope is created through the real Node crypto boundary because the production constructor must reject legacy policy values.

## Execution lifecycle
completed

## Touched paths observed
- `apps/api/src/features/auth/infrastructure/node-crypto-password-hasher.ts`
- `apps/api/test/auth.primitives.test.mjs`
- `docs/handoffs/EF-120-I-R2/worker-report.md`

## Session/resume reference
unavailable

## Risks
None observed within the packet scope. The declared typecheck invokes Prisma client generation but did not perform a database migration, database connection, infrastructure mutation, environment-file access, or Git publication action.

## Documentation impact observed
Not required: the change is an internal policy-validation boundary with behavioral regression coverage; no public API, runtime configuration contract, or operator surface changed.

## Git/publication posture observed
No staging, commit, push, tag, deployment, or publication action was performed. A Luna Git audit is required before any separately authorized publication step.

## Recommended next human decision
Review this executor evidence and, if approved, route the independent verification phase; this report does not authorize any subsequent action.
