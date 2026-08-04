# Role Report — EF-121-II

## Status

BLOCKED

## Goal

Implement the approved protected Nest HTTP organization vertical slice within the packet boundary.

## Allowed paths used

- `docs/handoffs/EF-121-II/worker-report.md`

No product source or test path was written.

## Files changed

- `docs/handoffs/EF-121-II/worker-report.md` — this blocked-phase evidence report.

## Commands run

```text
pwd
# exit 0
# /home/server/projects/estateflow

git status --short
# exit 0; observed pre-existing modified and untracked paths, including packet-forbidden Auth and organization source. They were not modified in this phase.

pnpm --dir apps/api run build && node --test apps/api/test/organization.application.test.mjs && printf '\n--- principal and repository authority boundary ---\n' && grep -n -E 'platformRole|return \{' apps/api/src/features/auth/application/{session-bundle,authenticate-access}.ts apps/api/src/features/auth/http/auth-request.ts apps/api/src/features/organizations/application/organization.repository.ts
# exit 0
# TypeScript build completed.
# Node test summary: tests 12; pass 12; fail 0; cancelled 0; skipped 0; todo 0.
# The authority-boundary grep printed only return sites in session-bundle.ts and authenticate-access.ts.

set -o pipefail
printf '%s\n' '--- explicit platform-role contract search ---'
grep -R -n 'platformRole' apps/api/src/features/auth/application apps/api/src/features/auth/http/auth-request.ts apps/api/src/features/organizations/application/organization.repository.ts || test $? -eq 1
pnpm exec prettier --check docs/handoffs/EF-121-II/worker-report.md
git diff --check --no-index /dev/null docs/handoffs/EF-121-II/worker-report.md || test $? -eq 1
git status --short -- docs/handoffs/EF-121-II/worker-report.md
# exit 0
# The explicit platform-role search had no matches.
# Prettier: All matched files use Prettier code style!
# diff --check produced no whitespace errors.
# Status: ?? docs/handoffs/EF-121-II/worker-report.md
```

No Docker, database, migration, integration, runtime-smoke, commit, push, deploy, or package-install command was run.

## Observed output

The approved `ApproveBrokerMembership` application use case requires an actor with `platformRole: "PLATFORM_ADMIN"`. The existing EF-120 `SessionPrincipal`, `AuthenticatedPrincipal`, and `AuthenticateAccess.execute()` result contain only user, family, access-session, verified, and CSRF-hash fields. They do not carry a platform role.

The allowed organization repository port also has no operation that reads a caller's platform role. The packet forbids the Auth application, domain, infrastructure, and BrowserSessionGuard sources where an authenticated principal could be extended from the persisted `User.platformRole`.

Therefore an HTTP adapter restricted to `request.auth` can prove verification but cannot distinguish a persisted `PLATFORM_ADMIN` from `NONE`. Treating a test-only extra property on `request.auth` as authority would make the platform approval route unreachable for every real EF-120 browser session and would not meet the platform-admin approval contract.

## Verification

- Existing organization application policy: the focused compiled test command completed with 12 passing tests and 0 failures.
- The requested HTTP RED/GREEN cycle was not started: the first required behavior, platform-admin approval from an authenticated session, cannot be implemented or honestly tested with the permitted interfaces.
- Remaining packet acceptance commands were not run because they cannot establish the blocked platform-authority behavior.

## Execution lifecycle

completed

## Touched paths observed

The worktree contains pre-existing modified/untracked Auth, organization, Prisma, bootstrap, test, and documentation paths. This phase wrote only the packet-declared report path. Observed paths are not scope proof.

## Session/resume reference

No resumable worker session reference was created.

## Risks

Implementing the other five routes while defaulting every authenticated actor to `NONE` would leave the sixth required route permanently denied, falsely simulating the required platform-admin policy. Reading platform role from the request body, parameters, or an untyped test fixture would create an authorization bypass.

## Documentation impact observed

required — the missing authenticated-principal authority contract must be resolved in a separately approved design/implementation packet before the HTTP surface can accurately document platform approval authorization.

## Git/publication posture observed

No staging, commit, push, deployment, or publication action was performed. A future Git audit would be required before any publication decision.

## Recommended next human decision

Issue a new approved delta packet that explicitly permits the minimal Auth authenticated-principal/repository change needed to load the persisted `User.platformRole` into `request.auth` for each validated access session, with focused Auth and HTTP RED/GREEN coverage. It must preserve EF-120 cookie, origin, CSRF, and session behavior. After that independent verification and a new human gate, reissue EF-121-II or a narrow successor packet for the six-route HTTP slice.
