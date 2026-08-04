# Role Report — EF-121-AUTH-A-R1

## Status
PARTIAL

## Goal
Complete the persisted `platformRole` (`NONE | PLATFORM_ADMIN`) mapping into authenticated session principals for login and active-access authentication, without changing cookie, session, CSRF, origin, or HTTP response behavior.

## Allowed paths used
- `apps/api/src/features/auth/application/session-bundle.ts`
- `apps/api/src/features/auth/application/auth.repository.ts`
- `apps/api/src/features/auth/application/authenticate-access.ts`
- `apps/api/src/features/auth/application/login.ts`
- `apps/api/src/features/auth/infrastructure/prisma-auth.repository.ts`
- `apps/api/src/features/auth/http/auth-request.ts`
- `apps/api/test/auth.application.test.mjs`
- `apps/api/test/auth.http.test.mjs`
- `docs/handoffs/EF-121-AUTH-A-R1/worker-report.md`

## Files changed
- `apps/api/src/features/auth/application/auth.repository.ts` — added the exact required platform-role contract to persisted identity and active-access repository results.
- `apps/api/src/features/auth/application/session-bundle.ts` — added required `platformRole` to `SessionPrincipal`.
- `apps/api/src/features/auth/application/login.ts` — maps only the repository identity role into the login principal.
- `apps/api/src/features/auth/application/authenticate-access.ts` — maps only the repository active-access role into the authenticated principal.
- `apps/api/src/features/auth/infrastructure/prisma-auth.repository.ts` — selects persisted user role for identity and active-access lookups and maps it to repository results.
- `apps/api/src/features/auth/http/auth-request.ts` — aliases the HTTP authenticated-principal type to the application principal, preventing field drift.
- `apps/api/test/auth.application.test.mjs` — RED/GREEN coverage for login `NONE` and `PLATFORM_ADMIN` mapping and active-access mapping.
- `apps/api/test/auth.http.test.mjs` — updated authenticated-principal fixture with the required role.

## Commands run
1. `npm --prefix apps/api test -- auth.application.test.mjs` before production edits.
2. `npm --prefix apps/api test -- auth.application.test.mjs` after extending the existing RED tests and before production edits.
3. `npm --prefix apps/api test -- auth.application.test.mjs` after implementation.
4. `pnpm --dir apps/api exec eslint src --max-warnings=0`.
5. `pnpm --dir apps/api exec prettier --write ...` for the packet-listed changed files.
6. `pnpm --dir apps/api exec prettier --check ...` for the packet-listed changed files.
7. `git diff --check -- <packet-listed source and test paths>`.
8. `pnpm --dir apps/api run build && node --test apps/api/test/auth.application.test.mjs apps/api/test/auth.http.test.mjs`.
9. `npm --prefix apps/api test`.

## Observed output
- Initial RED: `access authentication maps persisted platform roles into the principal and rejects invalid sessions` failed because `platformRole: 'NONE'` was absent from the principal.
- Extended RED: login principal mapping and active-access mapping failed for the same absent required field; 110 passed, 2 failed.
- Focused GREEN after implementation: build exited 0; `auth.application.test.mjs` and `auth.http.test.mjs` reported 23 passed, 0 failed.
- Lint exited 0 with no output.
- Targeted Prettier check reported: `All matched files use Prettier code style!`
- Targeted `git diff --check` exited 0 with no output.
- Full unit test command exited 1: 110 passed, 2 failed. The failures are both in forbidden `apps/api/test/auth.repository.unit.test.mjs`; its existing fake Prisma records omit the newly required persisted `platformRole`, so the repository now returns `platformRole: undefined` where those stale expected objects omit the field.

## Verification
- Build/typecheck: PASS — `pnpm --dir apps/api run build` exited 0.
- Focused application and HTTP tests: PASS — 23/23 passed.
- Lint: PASS — exited 0.
- Targeted formatting and diff checks: PASS — Prettier check and `git diff --check` exited 0.
- Full test: PARTIAL — 110/112 passed; the two stale repository-unit fixtures cannot be corrected because their file is outside the packet allowed paths.
- No database, Docker, schema, migration, commit, push, or deploy command was run.

## Execution lifecycle
completed

## Touched paths observed
The implementation and report paths listed under `Files changed` were the only paths intentionally edited in this phase. The worktree already contained unrelated modified and untracked paths before execution; this observation is a review starting point, not scope proof.

## Session/resume reference
No session/resume reference created.

## Clean-code guard
`clean-code-guard: clean` — reviewed the narrow mapping diff for unnecessary abstractions, defensive fallbacks, duplicated contracts, error handling changes, unused imports, and cookie/CSRF/origin changes; none were introduced.

## Risks
The required full-suite criterion remains unmet until a new approved delta packet permits updating the two stale fixtures in `apps/api/test/auth.repository.unit.test.mjs` to provide and expect persisted `platformRole` values. No production fallback was added because it would violate the required exact principal contract.

## Documentation impact observed
required — the authenticated principal contract now contains a persisted platform role; CTO routing should determine the appropriate approved technical-context update.

## Git/publication posture observed
No commit, push, deploy, staging, or publication occurred. A Luna Git Audit is required before any future publication action.

## Recommended next human decision
Issue a narrow approved delta packet allowing only `apps/api/test/auth.repository.unit.test.mjs` and its handoff artifact to update the stale Prisma fixture and assertions, then rerun the full test suite.
