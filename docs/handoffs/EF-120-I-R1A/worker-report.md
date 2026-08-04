# EF-120-I-R1A worker report

## Goal
Implement the approved EF-120-I-R1 auth security repairs after the reconnaissance-only timeout.

## Allowed paths used
- `apps/api/src/bootstrap/config.ts`
- `apps/api/src/bootstrap/config.test.ts`
- `apps/api/src/features/auth/application/auth.repository.ts`
- `apps/api/src/features/auth/infrastructure/node-crypto-credential-issuer.ts`
- `apps/api/src/features/auth/infrastructure/node-crypto-password-hasher.ts`
- `apps/api/src/features/auth/infrastructure/prisma-auth.repository.ts`
- `apps/api/test/auth.primitives.test.mjs`
- `apps/api/test/auth.repository.integration.mjs`
- `docs/handoffs/EF-120-I-R1A/worker-report.md`

## Files changed
- `apps/api/src/bootstrap/config.ts`: require production auth/audit HMAC keys of at least 32 UTF-8 bytes.
- `apps/api/src/bootstrap/config.test.ts`: use safe production key fixtures and assert weak-key rejection.
- `apps/api/src/features/auth/application/auth.repository.ts`: add `presentedTokenHash` to `RefreshRotation`.
- `apps/api/src/features/auth/infrastructure/node-crypto-credential-issuer.ts`: reject constructor HMAC keys shorter than 32 UTF-8 bytes.
- `apps/api/src/features/auth/infrastructure/node-crypto-password-hasher.ts`: validate constructor and parsed-envelope policies before Argon2, bound numeric/salt/tag values, enforce canonical base64url, and include salt length in `needsRehash`.
- `apps/api/src/features/auth/infrastructure/prisma-auth.repository.ts`: compare the presented and persisted token hashes with a length guard plus `timingSafeEqual` before mutation; retry only `P2034` across the whole Serializable transaction, for at most three attempts.
- `apps/api/test/auth.primitives.test.mjs`: add weak-HMAC-key, invalid-password-policy/envelope, and salt-rehash behavior tests.
- `apps/api/test/auth.repository.integration.mjs`: add wrong-hash no-mutation and distinct-value concurrent rotation/replay assertions.

## RED/GREEN evidence
- RED: behavioral tests were written before implementation, but no pre-fix behavioral execution was available without building the source into `dist`; the normal test route includes the database integration test and no isolated-target guard was supplied. Therefore no executable behavioral RED result is claimed.
- GREEN: a source-level non-DB primitive check passed. It asserted production weak-key rejection, issuer weak-key rejection, valid Argon2 verification, invalid-envelope `false` without rejection, salt-policy rehash, and invalid constructor-policy rejection. Output: `auth primitive source checks passed`.
- GREEN: a source-level mocked repository check passed. It asserted wrong-hash rejection without an update call, one `P2034` retry into replay/family revocation, and rethrow of a non-`P2034` error. Output: `auth repository source checks passed`.

## Commands run
1. `pnpm --dir apps/api run typecheck`
   - Exit: 0.
   - Observed output: the project script invoked `pnpm run db:generate`, Prisma Client generation completed, then `tsc --project tsconfig.json --noEmit` completed successfully.
2. `pnpm lint`
   - Exit: 0 (run twice; final run was after all edits).
   - Observed output: `Workspace boundary check passed for 4 packages.` and `Infrastructure contract check passed: local and test stacks are isolated.`
3. Source-level non-DB primitive check through `tsx -e`.
   - First invocation exited 1 because top-level `await` is unsupported by the eval CJS output format; no application behavior ran.
   - Corrected async-IIFE invocation exited 0. Output: `auth primitive source checks passed`.
4. Source-level non-DB mocked repository check through `tsx -e`.
   - Exit: 0. Output: `auth repository source checks passed`.

## Unrun verification
- `pnpm --dir apps/api run db:generate` was not separately run; it was invoked by the successful `typecheck` script.
- `pnpm --dir apps/api run test` was not run: the listed integration test directly connects, deletes records, and writes records; no guard proved an isolated database target.
- `node --test apps/api/dist/bootstrap/config.test.js` was not run: the checked-in `dist` is not a fresh build of these source/test edits, so it would not provide valid evidence.
- `git diff --check` was not run because the packet prohibits Git actions.

## Status
PARTIAL

## Risks
- The required database integration execution is unverified because an isolated-target guard was not provided.
- Executable behavioral RED evidence is unavailable; only the authored RED tests and post-fix source-level behavior checks are present.
- The package `typecheck` script generated Prisma Client as a nested project-script step, despite the packet's no-DB-action constraint; its output showed client generation only, not a database connection.
- Full compiled `dist` test execution remains unverified.

## Next recommended step
Provide a fresh bounded verification packet with an explicit isolated database-target guard, authorization to run the integration test against that target, and authorization for the required fresh build/test route. Do not publish or perform Git actions.
