# Role Report — EF-120-III-B3

## Status
PASS

## Goal
Complete reset and refresh per-subject abuse controls using opaque subject resolution before password hashing or replacement-session issuance, with generic invalid-token behavior retained.

## Allowed paths used
- `apps/api/src/features/auth/application/auth-abuse-policy.ts`
- `apps/api/src/features/auth/application/auth-abuse-control.ts`
- `apps/api/src/features/auth/application/auth.repository.ts`
- `apps/api/src/features/auth/application/reset-password.ts`
- `apps/api/src/features/auth/application/refresh-session.ts`
- `apps/api/src/features/auth/infrastructure/prisma-auth.repository.ts`
- `apps/api/test/auth.abuse-application.test.mjs`
- `apps/api/test/auth.application.test.mjs`
- `apps/api/test/auth.recovery.test.mjs`
- `apps/api/test/auth.repository.unit.test.mjs`
- `apps/api/test/auth.repository.integration.mjs`
- `docs/handoffs/EF-120-III-B3/worker-report.md`

## Files changed
- `apps/api/src/features/auth/application/auth-abuse-policy.ts` — added frozen, validated reset (5/20) and refresh (60/200) limits under the existing 15-minute window.
- `apps/api/src/features/auth/application/auth-abuse-control.ts` — added reset/refresh consumption using real internal user subjects or fixed-prefix opaque synthetic subjects at a supplied command instant.
- `apps/api/src/features/auth/application/auth.repository.ts` — added internal-user-id-only reset and refresh subject lookup ports.
- `apps/api/src/features/auth/application/reset-password.ts` — resolves opaque reset subject and consumes rate limits before Argon password hashing and atomic reset.
- `apps/api/src/features/auth/application/refresh-session.ts` — resolves opaque refresh subject and consumes rate limits before replacement-session issuance and rotation.
- `apps/api/src/features/auth/infrastructure/prisma-auth.repository.ts` — added reset expiry/consumption-filtered subject lookup and refresh opaque-ID lookup with length-guarded constant-time hash comparison, including replayable rows.
- `apps/api/test/auth.abuse-application.test.mjs` — added compiled policy, opaque-key, ordering, one-clock, rejection, generic-error, partial-wiring, and operational-fault coverage.
- `apps/api/test/auth.application.test.mjs` — updated the application test repository double for the expanded refresh port.
- `apps/api/test/auth.recovery.test.mjs` — updated the recovery test repository double for the expanded reset port.
- `apps/api/test/auth.repository.unit.test.mjs` — added reset expiry-filter and refresh hash-comparison/selection coverage.
- `apps/api/test/auth.repository.integration.mjs` — wrote guarded DB coverage for subject resolution, replay attribution, and reset/refresh endpoint independence; not run by packet instruction.
- `docs/handoffs/EF-120-III-B3/worker-report.md` — this report.

## Commands run
1. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — behavioral RED: exit `1`; the reset control method was absent.
2. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — control GREEN: exit `0`; 9 tests passed.
3. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — application-wiring RED: exit `1`; new assertions observed missing reset/refresh subject resolution.
4. `pnpm --dir apps/api run build && node --test apps/api/test/auth.repository.unit.test.mjs` — repository RED: exit `1`; both new subject lookup methods were absent.
5. Focused compiled application and repository test runs — final exit `0`; 24 tests passed.
6. `pnpm --dir apps/api run test` — final fresh exit `0`; 86 tests passed, 0 failed.
7. `node --test apps/api/dist/bootstrap/config.test.js` — exit `0`; 2 tests passed, 0 failed.
8. `pnpm --dir apps/api run typecheck` — exit `0`; Prisma Client generation and TypeScript no-emit checking completed without a database connection.
9. `pnpm lint` — exit `0`; ESLint reported no warnings/errors, workspace boundary check passed, and infrastructure contract check passed.
10. `git diff --check` — final result recorded below.

## Observed output
- An intermediate complete package-suite run exited `1` with five affected tests because existing test doubles did not implement the newly required lookup ports. The sole root cause was confirmed by the runtime `TypeError` stack traces. The allowed test doubles were extended with the port behavior, their focused run exited `0` with 15 tests passed, and the final fresh package suite exited `0` with 86 tests passed.
- `git diff --check` exited `0` with no output after the report was written.
- No DB integration command was run. The packet explicitly requires the guarded integration additions to be written but not run.
- No HTTP smoke test was run; HTTP is outside this packet.

## Verification
- Reset and refresh limits are immutable and exactly 5/20 and 60/200, with the policy window fixed at 900000 ms.
- Valid reset and refresh requests resolve only internal user IDs, rate-consume before password hashing or replacement-session issuance, and use one captured clock instant.
- Unknown reset credentials use the opaque reset-hash synthetic subject; unknown refresh credentials use the opaque refresh-ID synthetic subject. Raw secrets are neither passed to rate consumption nor returned by subject lookup.
- Rejected rate decisions throw `AuthRateLimitExceededError` before reset mutation or session issuance. Invalid reset and refresh outcomes retain their typed generic errors. Subject-resolution and rate-control faults propagate.
- Reset lookup filters consumed and expired records. Refresh lookup selects only the stored hash plus family user ID and attributes matching consumed, expired, and revoked refresh records to the real subject.
- The optional B2-compatible wiring seam fails closed for reset and refresh when only one wiring dependency is supplied.
- Guarded database integration coverage is present but intentionally unexecuted. No database connection, migration, or HTTP execution was performed.

## Execution lifecycle
completed

## Touched paths observed
- Source and tests written by this phase are limited to the packet-listed paths above; the existing workspace also contained pre-existing changes outside this packet.
- Compiled `dist` output was generated only by required build/test commands and was not manually edited.

## Session/resume reference
unavailable

## Risks
None within the approved no-DB scope. The written integration coverage remains unexecuted by explicit packet instruction.

## Documentation impact observed
Documentation impact: not required. No public HTTP, configuration, schema, or operator surface changed.

## Git/publication posture observed
No staging, commit, push, tag, deployment, or publication was performed. A separate authorized audit and human gate are required before any publication.

## Quality guard review
- `apps/api/src/features/auth/application/auth-abuse-control.ts`, `reset-password.ts`, `refresh-session.ts`, and `prisma-auth.repository.ts` — control flow is narrow, operational errors are not swallowed, no dependencies or configuration were added, and the existing temporary seam was preserved without expanding composition scope.
- `apps/api/test/auth.abuse-application.test.mjs`, `auth.application.test.mjs`, `auth.recovery.test.mjs`, and `auth.repository.unit.test.mjs` — tests use real command objects with boundary fakes, assert observable order and outcomes, and avoid framework-only assertions.
- clean-code-guard: clean
- test-guard: clean

## Recommended next human decision
Review this executor evidence. If DB evidence is required, issue a separately approved integration-verification packet; this report authorizes no successor, repair, commit, or publication.
