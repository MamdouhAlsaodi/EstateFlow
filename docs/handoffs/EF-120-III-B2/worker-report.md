# Role Report — EF-120-III-B2

## Status
PASS

## Goal
Wire verified registration, login, and password-recovery abuse persistence through an injectable application policy/control service, using compiled TDD and retaining the explicitly temporary compatibility seam.

## Allowed paths used
- `apps/api/src/features/auth/application/auth-abuse-policy.ts`
- `apps/api/src/features/auth/application/auth-abuse-control.ts`
- `apps/api/src/features/auth/application/register-user.ts`
- `apps/api/src/features/auth/application/login.ts`
- `apps/api/src/features/auth/application/request-password-recovery.ts`
- `apps/api/src/features/auth/domain/auth-errors.ts`
- `apps/api/test/auth.abuse-application.test.mjs`
- `docs/handoffs/EF-120-III-B2/worker-report.md`

## Files changed
- `apps/api/src/features/auth/application/auth-abuse-policy.ts` — immutable, validated injected policy and required default limits/windows.
- `apps/api/src/features/auth/application/auth-abuse-control.ts` — opaque context validation, generic registration/recovery rate consumption, login reservation/reconciliation, and the documented temporary wiring resolver.
- `apps/api/src/features/auth/application/register-user.ts` — validates before rate enforcement and performs rate enforcement before password/verification work.
- `apps/api/src/features/auth/application/login.ts` — reserves valid attempts before credential work, preserves reservations on failed credentials, reconciles only after successful verification/rehash, then creates the session.
- `apps/api/src/features/auth/application/request-password-recovery.ts` — normalizes once, rate-controls a fixed internal malformed-account sentinel, then issues recovery material only when allowed.
- `apps/api/src/features/auth/domain/auth-errors.ts` — typed rate-limit and incomplete-wiring errors.
- `apps/api/test/auth.abuse-application.test.mjs` — compiled behavioral coverage for policy/control inputs, opaque boundaries, command ordering, generic outcomes, temporary wiring, and propagation.
- `docs/handoffs/EF-120-III-B2/worker-report.md` — this evidence report.

## Commands run
1. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — initial RED.
2. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — initial focused GREEN.
3. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — application-wiring RED.
4. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — application-wiring GREEN.
5. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — opaque-context validation RED.
6. `pnpm --dir apps/api run build && node --test apps/api/test/auth.abuse-application.test.mjs` — opaque-context validation GREEN.
7. `pnpm --dir apps/api run test`
8. `node --test apps/api/dist/bootstrap/config.test.js`
9. `pnpm --dir apps/api run typecheck`
10. `pnpm lint`
11. `git diff --check`
12. `test -s docs/handoffs/EF-120-III-B2/worker-report.md && git diff --check && grep -E 'AuthAbuseControl|AuthRateLimitExceededError|AuthAbuseConfigurationError|resolveAuthAbuseControl' apps/api/src/features/auth/application/auth-abuse-control.ts apps/api/src/features/auth/domain/auth-errors.ts >/dev/null`

## Observed output
- Initial RED exited `1`: the compiled application-control module was absent.
- Initial focused GREEN exited `0`: `2` tests passed.
- Application-wiring RED exited `1`: `3` tests passed and `4` failed at the expected absent abuse enforcement/wiring assertions.
- Application-wiring GREEN exited `0`: `7` tests passed.
- Opaque-context validation RED exited `1`: `7` tests passed and the new rejection assertion failed because a noncanonical context reached the fake repository.
- Opaque-context validation GREEN exited `0`: `8` tests passed.
- Final package test exited `0`: `78` tests passed, `0` failed.
- Compiled configuration test exited `0`: `2` tests passed, `0` failed.
- Typecheck exited `0`; its declared script generated Prisma Client and completed TypeScript no-emit checking. No migration or database connection was run.
- Root lint exited `0`; workspace and infrastructure contract checks passed.
- `git diff --check` exited `0` with no output.
- Final report presence, post-report whitespace check, and referenced-symbol verification exited `0` with no output.

## Verification
- Registration/recovery repository calls receive canonical opaque account and client-source hashes only; malformed client-source input is rejected before a repository call.
- Registration rejection occurs before password hashing and verification-secret work.
- Recovery known, unknown, and malformed inputs return the same accepted result while rejection occurs before secret issuance.
- Login applies exact policy inputs/windows, maps locked/rate-limited decisions to generic authentication failure, preserves unknown/wrong reservations, and reconciles before session creation after successful verification.
- One clock instant is used by each command for abuse and expiry/session behavior.
- Partial temporary wiring fails closed; the resolver comment mandates removal when composition is authorized.
- No HTTP, reset, refresh, audit, database runtime, infrastructure, configuration, environment, dependency, or Git mutation was performed.
- No runtime HTTP smoke test was run because HTTP execution is outside this packet.

## Execution lifecycle
completed

## Touched paths observed
- Only the packet-listed source/test paths above and this report were written by this phase. Compiled output was produced by the packet-required verification build and was not manually edited.

## Session/resume reference
unavailable

## Risks
None within this packet. The intentionally temporary optional wiring seam must be removed by the future authorized composition packet.

## Documentation impact observed
Documentation impact: required only for the mandated composition-packet removal of the temporary seam; no public/runtime documentation surface changed in this packet.

## Git/publication posture observed
No staging, commit, push, tag, deployment, or publication was performed. A separately authorized audit and human gate remain required before any publication.

## Quality guard review
- `apps/api/src/features/auth/application/auth-abuse-policy.ts` and `apps/api/src/features/auth/application/auth-abuse-control.ts` — policy validation, opaque boundary validation, and repository decisions remain narrowly separated; no error suppression, dependency, or speculative runtime configuration was introduced.
- `apps/api/src/features/auth/application/register-user.ts`, `login.ts`, and `request-password-recovery.ts` — command ordering is explicit and preserves existing generic semantics outside the enabled abuse wiring.
- `apps/api/test/auth.abuse-application.test.mjs` — fakes isolate clock, persistence, and issuer/delivery boundaries; assertions cover observable command ordering and required port contracts without framework or database simulation claims.
- clean-code-guard: clean
- test-guard: clean

## Recommended next human decision
Review this executor evidence. If composition is approved later, issue a new bounded packet that makes abuse dependencies/context mandatory and removes the temporary seam; this report authorizes no successor, repair, commit, or publication.
