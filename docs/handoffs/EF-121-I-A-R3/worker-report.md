# Role Report — EF-121-I-A-R3

## Status

PASS

## Goal

Correct `CreateMembership` so the target user is verified through `OrganizationRepository` before membership persistence, while retaining Client-to-`ACTIVE` and Broker-to-`PENDING` behavior.

## Allowed paths used

- `apps/api/src/features/organizations/application/organization.repository.ts`
- `apps/api/src/features/organizations/application/create-membership.ts`
- `apps/api/test/organization.application.test.mjs`
- `docs/handoffs/EF-121-I-A-R3/worker-report.md`

## Files changed

- `apps/api/src/features/organizations/application/organization.repository.ts` — added the `isUserVerified(userId)` repository contract.
- `apps/api/src/features/organizations/application/create-membership.ts` — denies an unverified target before `createMembership`.
- `apps/api/test/organization.application.test.mjs` — added target-verification behavior to the in-memory repository, a regression test proving denial/no persistence, and verified fixtures for successful persistence paths.
- `docs/handoffs/EF-121-I-A-R3/worker-report.md` — this evidence report.

## RED evidence

After adding the regression test and before changing the repository contract or use case, this command exited `1`:

```text
$ node --test apps/api/test/organization.application.test.mjs
...
✖ CreateMembership rejects an unverified target and does not persist a membership (1.299543ms)
...
ℹ tests 7
ℹ suites 0
ℹ pass 6
ℹ fail 1
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 159.911779

✖ failing tests:

test at apps/api/test/organization.application.test.mjs:245:1
✖ CreateMembership rejects an unverified target and does not persist a membership (1.299543ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection (OrganizationForbiddenError).
      at async assertForbidden (file:///home/server/projects/estateflow/apps/api/test/organization.application.test.mjs:125:3)
      at async TestContext.<anonymous> (file:///home/server/projects/estateflow/apps/api/test/organization.application.test.mjs:255:3)
      at async Test.run (node:internal/test_runner/test:1125:7)
      at async Test.processPendingSubtests (node:internal/test_runner/test:787:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    operator: 'rejects',
    diff: 'simple'
  }

[exit code: 1]
```

The test reached its assertion and failed because the old implementation persisted the unverified target rather than throwing `OrganizationForbiddenError`.

## Commands run

| Command                                                                                                | Exit code | Observed output                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm --dir apps/api run build && node --test apps/api/test/organization.application.test.mjs` (GREEN) |         0 | API TypeScript build completed; Node reported 7 tests, 7 passed, 0 failed.                                                                                         |
| `pnpm --dir apps/api run build`                                                                        |         0 | `> pnpm exec tsc --project tsconfig.json`                                                                                                                          |
| `node --test apps/api/test/organization.application.test.mjs`                                          |         0 | `tests 7`; `pass 7`; `fail 0`; `cancelled 0`; `skipped 0`; `todo 0`.                                                                                               |
| `pnpm --dir apps/api run test`                                                                         |         0 | API build completed; `tests 107`; `pass 107`; `fail 0`; `cancelled 0`; `skipped 0`; `todo 0`.                                                                      |
| `pnpm --dir apps/api run typecheck`                                                                    |         0 | `prisma generate --schema prisma/schema.prisma`; Prisma Client generated; `pnpm exec tsc --project tsconfig.json --noEmit` completed. No database command was run. |
| `pnpm lint`                                                                                            |         0 | `Workspace boundary check passed for 4 packages.` and `Infrastructure contract check passed: local and test stacks are isolated.`                                  |
| `git diff --check`                                                                                     |         0 | No output.                                                                                                                                                         |

## Final verification output

```text
$ pnpm --dir apps/api run build

> @estateflow/api@0.1.0 build /home/server/projects/estateflow/apps/api
> pnpm exec tsc --project tsconfig.json

[exit code: 0]

$ node --test apps/api/test/organization.application.test.mjs
✔ organization permissions are deny-by-default, require an active membership, and exclude platform role
✔ CreateOrganization uses one atomic owner operation and rejects unverified and conflicting requests
✔ CreateMembership permits only verified active Owner or Manager to create active Client or pending Broker in their organization
✔ CreateMembership rejects an unverified target and does not persist a membership
✔ CreateMembership rejects unverified, absent, inactive, and non-managing callers and never permits Owner or Manager targets
✔ CreateMembership maps repository conflicts to a typed conflict without persistence detail
✔ ApproveBrokerMembership is limited to verified PlatformAdmin and atomically records approver and time
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
[exit code: 0]

$ pnpm --dir apps/api run test

> @estateflow/api@0.1.0 test /home/server/projects/estateflow/apps/api
> pnpm run build && node --test test/*.test.mjs

...
ℹ tests 107
ℹ suites 0
ℹ pass 107
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
[exit code: 0]

$ pnpm --dir apps/api run typecheck

> @estateflow/api@0.1.0 typecheck /home/server/projects/estateflow/apps/api
> pnpm run db:generate && pnpm exec tsc --project tsconfig.json --noEmit

> @estateflow/api@0.1.0 db:generate /home/server/projects/estateflow/apps/api
> prisma generate --schema prisma/schema.prisma

Prisma schema loaded from prisma/schema.prisma
✔ Generated Prisma Client (v6.19.0) to ./../../node_modules/.pnpm/@prisma+client@6.19.0_prisma@6.19.0_typescript@6.0.3__typescript@6.0.3/node_modules/@prisma/client in 368ms
[exit code: 0]

$ pnpm lint

> estateflow@0.1.0 lint /home/server/projects/estateflow
> pnpm exec eslint . --max-warnings=0 && node scripts/verify-workspace.mjs && node scripts/verify-infrastructure.mjs

Workspace boundary check passed for 4 packages.
Infrastructure contract check passed: local and test stacks are isolated.
[exit code: 0]

$ git diff --check
[exit code: 0]
```

## Verification

- The RED regression proved the unverified target was previously accepted.
- The GREEN regression proves an unverified target receives `OrganizationForbiddenError` and `createMembershipCalls` remains empty.
- The focused and API suites prove verified Client targets remain `ACTIVE` and verified Broker targets remain `PENDING`.
- All packet verification commands ran after the final source edit with exit code `0`.

## Guard reviews

- `clean-code-guard`: clean. The change uses the existing consumer-owned repository port, adds no abstraction/dependency/error handling, and performs the required check before mutation.
- `test-guard`: clean. The regression exercises observable denial and the repository-boundary persistence side effect; it does not mock internal behavior or duplicate an existing scenario.

## Execution lifecycle

completed

## Touched paths observed

Final `git status --short -- <packet paths>` output:

```text
?? apps/api/src/features/organizations/application/create-membership.ts
?? apps/api/src/features/organizations/application/organization.repository.ts
?? apps/api/test/organization.application.test.mjs
?? docs/handoffs/EF-121-I-A-R3/worker-report.md
[exit code: 0]
```

These paths are untracked as part of the pre-existing EF-121 worktree state; the output is a review starting point, not proof of scope ownership.

## Scope audit

Only the three packet-allowed product/test files and this packet-declared report were edited. No domain, Prisma, HTTP, Nest, auth, dependency, environment, Git metadata, database, commit, push, deployment, or external action was performed. `typecheck` ran its declared Prisma-client generation step only; it did not run a database mutation command.

## Session/resume reference

None.

## Risks

- The repository port remains intentionally unbound in this pure application slice; a future approved adapter/composition task must implement `isUserVerified` against its authorized persistence boundary.
- The complete API suite includes unrelated pre-existing worktree coverage; its passing result does not establish ownership of those paths.

## Documentation impact observed

Documentation impact: required. The application repository contract has changed; CTO routing should decide any context/architecture documentation update in a separately authorized documentation task.

## Git/publication posture observed

No Git staging, commit, push, tag, deployment, or package publication was performed. A Luna Git Audit is required before any future publication under the governing policy.

## Recommended next human decision

Request independent review of this bounded correction. Do not treat this report as authorization for repository adapter work, commit, push, deployment, or other successor work.

## Complete verbatim final verification transcript

```text
$ pnpm --dir apps/api run build

> @estateflow/api@0.1.0 build /home/server/projects/estateflow/apps/api
> pnpm exec tsc --project tsconfig.json

[exit code: 0]

$ node --test apps/api/test/organization.application.test.mjs
✔ organization permissions are deny-by-default, require an active membership, and exclude platform role (1.956857ms)
✔ CreateOrganization uses one atomic owner operation and rejects unverified and conflicting requests (2.95085ms)
✔ CreateMembership permits only verified active Owner or Manager to create active Client or pending Broker in their organization (0.933572ms)
✔ CreateMembership rejects an unverified target and does not persist a membership (0.529598ms)
✔ CreateMembership rejects unverified, absent, inactive, and non-managing callers and never permits Owner or Manager targets (1.581433ms)
✔ CreateMembership maps repository conflicts to a typed conflict without persistence detail (0.534607ms)
✔ ApproveBrokerMembership is limited to verified PlatformAdmin and atomically records approver and time (1.308545ms)
ℹ tests 7
ℹ suites 0
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 161.395497
[exit code: 0]

$ pnpm --dir apps/api run test

> @estateflow/api@0.1.0 test /home/server/projects/estateflow/apps/api
> pnpm run build && node --test test/*.test.mjs


> @estateflow/api@0.1.0 build /home/server/projects/estateflow/apps/api
> pnpm exec tsc --project tsconfig.json

✔ registration rate consumption receives only opaque keys and the exact rolling window (7.780436ms)
✔ noncanonical client source input does not reach the abuse repository (2.100152ms)
✔ missing or malformed request correlation IDs do not reach abuse persistence (1.416738ms)
✔ registration rate rejection exposes only the typed application error (1.44277ms)
✔ policy is immutable and rejects non-safe limit values (0.84052ms)
✔ registration validates before abuse control and rejects before password or secret work (3.018308ms)
✔ recovery rate-controls normalized, unknown, and malformed inputs before secret issuance (5.008739ms)
✔ login reserves every valid attempt, leaves unknown and wrong reservations, and reconciles before session creation (9.464537ms)
✔ login rejects malformed input before reservation, hashing, or audit persistence while valid denied attempts audit once (1.858574ms)
✔ mandatory abuse and verification dependencies have no optional bypass (1.576831ms)
✔ reset and refresh consumption use subject-or-opaque synthetic account keys with exact policies (1.223287ms)
✔ password reset resolves an opaque subject and rate-controls before password hashing (1.478673ms)
✔ password reset maps unknown credentials to its generic error after synthetic rate consumption and stops on rejection (1.440178ms)
✔ refresh resolves a subject and rate-controls before replacement session issuance (1.949041ms)
✔ refresh uses an opaque synthetic subject for unknown credentials, rejects before issuance, and preserves generic invalid failures (1.899344ms)
✔ reset and refresh subject-resolution and rate-control operational faults propagate without mutation or issuance (2.275541ms)
✔ normalized inputs produce deterministic 43-character opaque HMAC keys (4.430379ms)
✔ rate consumption locks deterministic parameterized keys and persists both dimension outcomes (4.598239ms)
✔ rate events remain endpoint and dimension isolated while rejected events count (3.379884ms)
✔ locked reservations consume both rate dimensions without extending the fixed marker (8.709058ms)
✔ rate-limited reservations record a rate-limited attempt (2.779008ms)
✔ successful login reconciliation deletes account attempts but keeps rate events (1.367329ms)
✔ read-committed rate consumption caps P2034 handling at three attempts (1.746554ms)
✔ incoherent rate windows fail before a transaction (0.703187ms)
✔ malformed keys and endpoints fail before a transaction (2.315966ms)
✔ locked requests consume rate limits before returning a rate limit result (1.966162ms)
✔ registration normalizes valid identifiers, hashes before persistence, and accepts duplicates without disclosure (7.805267ms)
✔ registration rejects malformed identifiers and passwords outside code-point and UTF-8 limits (2.358028ms)
✔ login rejects malformed input without work, hashes a fixed dummy for unknown accounts, and gives wrong credentials the same typed generic failure (3.52445ms)
✔ login rehashes only when required and returns raw session material with an unverified session principal (4.107486ms)
✔ access authentication maps every malformed, absent, and invalid token to one typed invalid-session error (3.584941ms)
✔ access propagates repository, issuer, and clock operational errors (3.943757ms)
✔ get-session returns only the authenticated identifier and verification state, and logout revokes exactly its family (1.365722ms)
✔ refresh verifies parsed credential and canonical CSRF, passes both hashes to the repository, and preserves absolute expiry (2.773744ms)
✔ refresh propagates repository, issuer, and clock operational errors (3.549048ms)
✔ refresh presents generic invalid-refresh failures for malformed, rejected, and replayed input (3.140139ms)
✔ allowed audit persistence writes only the approved safe fields at one clock instant (7.421348ms)
✔ audit persistence rejects the unapproved SESSION_DENIED reason before repository writes (2.365886ms)
✔ audit outcome methods reject reasons assigned to the opposite outcome (1.58258ms)
✔ audit persistence rejects malformed UUIDs before repository writes (13.862366ms)
✔ audit persistence propagates repository operational errors (1.857205ms)
✔ session cookies use the approved names, scopes, and lifetimes (4.743513ms)
✔ session cookie serialization rejects invalid inputs before appending headers (2.269029ms)
✔ clearing a session expires all three cookies with their original scopes (0.521061ms)
✔ cookie parsing accepts one valid credential of each auth cookie name and ignores unrelated cookies (1.105599ms)
✔ cookie parsing rejects duplicate auth names without exposing raw values (1.125747ms)
✔ cookie parsing ignores encoded auth-name aliases and malformed unrelated values (0.424518ms)
✔ cookie parsing rejects controls, malformed exact-auth encoding, credentials, and CSRF (0.822771ms)
✔ safe requests do not require an Origin header (0.601016ms)
✔ unsafe requests require exactly the configured raw Origin (1.630375ms)
✔ CSRF guard permits an authenticated unsafe request with matching cookie, header, and server hash (2.485519ms)
✔ CSRF guard rejects invalid unsafe requests before a mutation callback (1.660866ms)
✔ CSRF guard does not require a token for safe requests (0.348987ms)
✔ request context hashes the bounded direct socket source and ignores forwarding headers (3.840773ms)
✔ request context fails closed when middleware did not provide a canonical request ID (1.068218ms)
✔ request context replaces missing and oversized direct sources with its fixed internal sentinel (0.922035ms)
✔ EF-120 guard enhancers receive their required dependencies from Nest (119.650782ms)
✔ auth composition imports AuthModule (0.618928ms)
✔ auth controller exposes only the required routes and response statuses (3.142212ms)
✔ unsafe route guard metadata preserves the required boundary order (0.957078ms)
✔ register returns only a generic accepted result (1.175382ms)
✔ registration and login failures map to generic HTTP errors while operational failures propagate (3.387708ms)
✔ login emits exactly three cookies and does not return session credentials (1.151396ms)
✔ refresh uses only the refresh guard attachment and clears cookies only for invalid refreshes (1.805954ms)
✔ logout revokes the authenticated family before clearing cookies and session exposes only principal fields (2.568526ms)
✔ browser guard authenticates a strict access cookie and returns generic 401s without audit persistence (5.581174ms)
✔ refresh CSRF guard rejects malformed, duplicate, and mismatched requests before the command (4.067612ms)
✔ all five auth commands receive the opaque request context (1.583232ms)
✔ recovery, reset, and rate-limit failures use generic HTTP responses without credential output (2.624891ms)
✔ opaque credentials contain a UUID and 256-bit CSPRNG secret hashed with HMAC-SHA-256 (5.717514ms)
✔ Argon2id hashes retain policy parameters and verify without plaintext persistence (603.020696ms)
✔ Argon2id verification accepts bounded legacy hashes and marks them for rehash (194.582278ms)
✔ Argon2id constructor enforces the approved policy floor (1.089343ms)
✔ refresh idle expiry cannot extend past the original absolute expiry (1.203911ms)
✔ fixed clocks retain exact expiry boundaries while system clock provides UTC instants (0.583309ms)
✔ one-time issuer emits canonical 32-byte secrets and HMAC hashes without accepting a wrong-length hash (6.371649ms)
✔ registration delivers a 15-minute verification only after first creation and never returns its secret (5.623909ms)
✔ password recovery has one generic response, persists a hash only for known identities, and delivers only there (2.467921ms)
✔ password reset maps malformed and invalid secrets to one error while a valid reset updates credentials and revokes every active family (7.611414ms)
✔ password reset leaves repository operational failures visible (1.115723ms)
✔ identity creation writes its registration audit event through the same transaction (8.935653ms)
✔ identity creation returns exists only for the User account identifier conflict (4.207334ms)
✔ identity lookup returns credential data and password rehash updates the credential only (2.269547ms)
✔ session-family creation atomically persists only opaque ids and hashes (1.427943ms)
✔ active access lookup requires unrevoked family and access with expiry strictly after now (1.946674ms)
✔ refresh rejects a wrong CSRF hash before any session mutation (2.075176ms)
✔ password recovery persists its secret hash only for an existing identity (2.155258ms)
✔ password reset conditionally consumes, updates, revokes every family, and retries serialization conflicts (2.954426ms)
✔ reset subject lookup selects only an unconsumed, unexpired user id by secret hash (1.165678ms)
✔ refresh subject lookup attributes matching opaque credentials including replayable rows without returning secrets (1.650455ms)
✔ security audit persistence writes exactly the safe fields and rejects invalid untyped input (2.308759ms)
✔ configuration requires explicit authentication settings in development (3.793798ms)
✔ configuration rejects invalid ports and production without secret (0.506893ms)
✔ request ID middleware preserves a valid UUID and generates a replacement (1.60353ms)
✔ health liveness remains independent from readiness (1.023294ms)
✔ test-only fake auth delivery is opt-in and rejected outside test (0.802311ms)
✔ database cleanup requires an explicit table allowlist (2.83395ms)
✔ database cleanup rejects unsafe identifiers before issuing SQL (0.795391ms)
✔ database cleanup truncates the allowlist with FK-safe CASCADE (1.859306ms)
✔ buildOpenApiDocument includes the composed auth and health paths (300.44146ms)
✔ organization permissions are deny-by-default, require an active membership, and exclude platform role (2.111179ms)
✔ CreateOrganization uses one atomic owner operation and rejects unverified and conflicting requests (4.708261ms)
✔ CreateMembership permits only verified active Owner or Manager to create active Client or pending Broker in their organization (1.072332ms)
✔ CreateMembership rejects an unverified target and does not persist a membership (0.567493ms)
✔ CreateMembership rejects unverified, absent, inactive, and non-managing callers and never permits Owner or Manager targets (1.943809ms)
✔ CreateMembership maps repository conflicts to a typed conflict without persistence detail (0.894165ms)
✔ ApproveBrokerMembership is limited to verified PlatformAdmin and atomically records approver and time (1.638116ms)
ℹ tests 107
ℹ suites 0
ℹ pass 107
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2921.118118
[exit code: 0]

$ pnpm --dir apps/api run typecheck

> @estateflow/api@0.1.0 typecheck /home/server/projects/estateflow/apps/api
> pnpm run db:generate && pnpm exec tsc --project tsconfig.json --noEmit


> @estateflow/api@0.1.0 db:generate /home/server/projects/estateflow/apps/api
> prisma generate --schema prisma/schema.prisma

Prisma schema loaded from prisma/schema.prisma

✔ Generated Prisma Client (v6.19.0) to ./../../node_modules/.pnpm/@prisma+client@6.19.0_prisma@6.19.0_typescript@6.0.3__typescript@6.0.3/node_modules/@prisma/client in 484ms

Start by importing your Prisma Client (See: https://pris.ly/d/importing-client)

Tip: Interested in query caching in just a few lines of code? Try Accelerate today! https://pris.ly/tip-3-accelerate

[exit code: 0]

$ pnpm lint

> estateflow@0.1.0 lint /home/server/projects/estateflow
> pnpm exec eslint . --max-warnings=0 && node scripts/verify-workspace.mjs && node scripts/verify-infrastructure.mjs

Workspace boundary check passed for 4 packages.
Infrastructure contract check passed: local and test stacks are isolated.
[exit code: 0]

$ git diff --check
[exit code: 0]
```
