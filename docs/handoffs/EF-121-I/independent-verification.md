# EF-121-I — Independent Verification

**Status: PASS (scoped)**

## Scope accepted

- Organization domain/RBAC and application use cases, including verified-target membership denial.
- Prisma organization/membership persistence, forward-only migration, and Prisma repository adapter.
- A test-runner correction that serializes destructive integration files to prevent their proven shared-fixture cleanup race.

## Independent evidence

| Requirement | Evidence |
| --- | --- |
| Lane | Pi writer session metadata verified `openai-codex/gpt-5.6-terra` for each governed writer. |
| Application policy | `organization.application.test.mjs`: 7 passed, 0 failed. Includes rejection of an unverified membership target with no persistence mutation. |
| API regression | `pnpm test`: 107 passed, 0 failed. |
| Static source | Build, typecheck, lint, Prisma generation, scoped Prettier check, and `git diff --check` passed. |
| Schema/migration | `prisma validate` passed with a process-local non-connecting placeholder; migration contract contains the required enums, unique membership key, Owner-active check, and partial Owner index. |
| Isolated DB guard | Accepted only `estateflow_test` on loopback port 55433 with explicit opt-in. |
| PostgreSQL integration | `pnpm --dir apps/api run test:integration`: 12 passed, 0 failed after applying the migration to the isolated test target. |
| Database invariants | Live isolated query confirmed migration applied, Owner-active check present, partial Owner index present. |
| Cleanup | Integration ended with `Organization=0` and `Membership=0`; Compose test stack teardown removed containers, network, and test listeners. |

## Correction verified

The initial full integration run exposed concurrent test-file cleanup against a shared isolated database. The organization integration test passed alone (2/2) and left `Organization|Membership = 0|0`, proving the source/migration were not the cause. `apps/api`'s existing integration runner now uses Node's explicit `--test-concurrency=1`; the full integration suite then passed 12/12.

## Formatting posture

Targeted EF-121 Prettier verification passed with zero Organization warnings. The workspace-wide `format:check` still reports pre-existing formatting warnings outside EF-121 (Auth and unrelated paths); it is not an EF-121 source failure and was not modified by this work.

## Boundaries honored

No commit, push, deployment, shared/live database use, credential change, or durable test-data mutation occurred.

## Read-boundary correction

The initial verification found the three approved read use-cases absent. `EF-121-I-R2` added `GetOrganization`, `GetMyMembership`, and `ListOrganizationMemberships` plus explicit minimal Prisma reads. Focused policy tests and the 112-test API suite passed. A follow-up isolated PostgreSQL run executed the new `findOrganization` and `listOrganizationMemberships` assertions: integration 12/12 passed, cleanup ended `Organization=0` and `Membership=0`, and the temporary stack was torn down. A test expectation omission for `organizationId` was corrected without changing production behavior.

## Next gate

`EF-121-II` may begin: the protected Nest HTTP authorization slice only. It must not alter the approved Prisma schema/migration or EF-120 session/cookie/CSRF/origin behavior.
