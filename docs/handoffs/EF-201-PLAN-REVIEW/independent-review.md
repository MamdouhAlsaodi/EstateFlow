# EF-201 Independent Plan Review

## Status
**BLOCKED** — do not grant G2 approval.

## Goal
Independently review the EF-201 implementation plan for G1 fidelity, executable commands, dependency ordering, exact scope, tenant/security boundaries, and task completeness.

## Allowed paths used
- `docs/handoffs/EF-201-G1/approved-baseline.md`
- `docs/handoffs/EF-201-CTO-R1/requirements-handoff.md`
- `docs/handoffs/EF-201-PLAN/implementation-plan.md`
- `package.json`
- `apps/api/package.json`
- `apps/api/prisma/schema.prisma`
- `apps/api/src/features/organizations/**`
- `apps/api/test/**`

## Files changed
- Created `docs/handoffs/EF-201-PLAN-REVIEW/independent-review.md` only.
- No source, config, schema, or test file was edited.

## Findings

### BLOCKER — planned feature tests are not exercised by the declared verification commands
T1 and T2 place tests under `apps/api/src/features/properties/tests/**`; T3 places an integration test under `apps/api/src/features/properties/tests/infrastructure/**`. However, `apps/api/package.json` defines:

- `test`: `node --test test/*.test.mjs`
- `test:integration`: `node --test --test-concurrency=1 test/*.integration.mjs`

Those globs do not include the planned feature test paths. Consequently, the required `pnpm test` and integration command do not prove the planned TDD evidence. The T3 command also invokes the root recursive script, whose API integration command runs the package-wide `test/*.integration.mjs` glob rather than the named feature test path.

**Repair:** revise the allowed test locations or provide explicit verification commands that build the feature and invoke every planned test file directly. Ensure T1/T2/T3 reports record literal red/green execution for those files and full regression separately.

### BLOCKER — the API route/DTO contract is not approved or specified
The requirements handoff explicitly lists endpoint names, DTOs, pagination, sort/filter fields, and error codes as unresolved G1 choices. The conservative G1 baseline does not approve them. T4 nevertheless requires exact route names to match an “approved DTO contract,” but no such contract is present in the packet sources or plan. This leaves the executor without an executable, product-approved HTTP boundary and permits an untracked product decision during implementation.

**Repair:** record the exact route, DTO, query, pagination/sort, response, and error contract in an approved decision artifact before G2, or narrow T4 so that a separately approved API-contract packet precedes implementation. Do not rely on an executor report to create approval retroactively.

### HIGH — T1 still leaves required property fields materially ambiguous
The plan requires Property and Listing persistence but says not to invent fields beyond “minimum address/property facts,” while the approved baseline does not define those fields. The requirements handoff identifies exact property/address/ownership/reference fields as unresolved. This is not sufficient to produce a deterministic schema, migration, DTO, or allowlist.

**Repair:** approve the minimal field set, nullability, sensitive-address handling, and ownership semantics before T1; otherwise explicitly remove those fields from EF-201 and defer them.

### HIGH — the integration verification command is not a reliably isolated named test
T3 presents `ALLOW_DESTRUCTIVE_TESTS=1 pnpm test:integration -- apps/api/src/features/properties/tests/infrastructure/property.repository.integration.test.mjs` as targeted evidence, but the existing scripts do not define a path-filtering interface. The API script runs migration deployment and the package-wide `test/*.integration.mjs` glob. The extra argument is not documented as selecting a test file. This can execute a broader suite while still failing to execute the planned nested test.

**Repair:** specify a command whose semantics are explicit, such as a directly invoked Node test command after build, while retaining the literal destructive-test guard assertion and cleanup proof. The packet must state whether migration deployment is part of the authorized isolated-test setup and must not imply that a path argument provides filtering unless verified.

### MEDIUM — audit behavior is omitted without an explicit boundary decision
The requirements handoff calls audit requirements unresolved and notes the existing security audit model. The plan changes property/listing lifecycle and image-management behavior but neither defines audit events nor explicitly records audit as deferred/out of scope. This creates a security/documentation completeness gap.

**Repair:** add an approved decision stating the required audit events and persistence owner, or explicitly defer audit with a documented rationale and acceptance impact.

### LOW — command availability depends on the documented Node 24 nvm environment
Supervisor evidence reports that `pnpm -s run` failed in a non-nvm shell because pnpm is supplied by the documented Node 24 nvm environment. This is an environment precondition, not a plan defect: `package.json` declares Node `>=24.14.1 <25`, pnpm `>=10.33.2 <11`, and package manager `pnpm@10.33.2`. The review shell used the documented environment and observed Node `v24.14.1` and pnpm `10.33.2`.

**Repair:** state the required nvm activation/runtime precondition in every executor and reviewer command section, and distinguish “command unavailable outside the documented environment” from a code or plan failure. Do not switch providers, package managers, or Node versions as a fallback.

## Dependency and security review
The plan correctly preserves the organization tenant boundary, requires verified actors and active memberships, excludes implicit PlatformAdmin access, limits Broker reads to published listings, requires organization-scoped repository methods, and separates T1 schema/domain, T2 application policy, T3 persistence, and T4 HTTP wiring. The one-active-listing database invariant and atomic version update are correctly identified as persistence concerns. These strengths do not resolve the blockers above.

## Commands run and observed output
- Read-only inspection of all packet-declared sources.
- `git status --short` — reported pre-existing unrelated worktree changes, including `docs/CURRENT_HANDOFF.md`, `docs/YUI_TECHNICAL_CONTEXT.md`, and numerous existing handoff paths; no EF-201 source/config/schema/test change was made by this review.
- `git diff --name-only` — `docs/CURRENT_HANDOFF.md`, `docs/YUI_TECHNICAL_CONTEXT.md`.
- `command -v pnpm` — `/home/server/.nvm/versions/node/v24.14.1/bin/pnpm`.
- `node --version` — `v24.14.1`.
- `pnpm --version` — `10.33.2`.
- No test, build, migration, database, Docker, or destructive command was run.

## Risks
- G2 approval could authorize schema/API work while required product decisions remain implicit.
- Reported green test commands could omit all newly planned feature tests.
- A misleading integration command could provide insufficient tenant, uniqueness, version, or cleanup evidence.
- Existing unrelated worktree changes make scope attribution dependent on the recorded baseline; no attempt was made to clean or modify them.

## Git/publication posture
No commit, push, deploy, migration execution, database mutation, Docker action, or publication was performed.

## Recommended next human decision
Do not approve G2. Re-issue or amend the plan after: (1) fixing test discovery and targeted integration commands, (2) approving the exact API/DTO contract, (3) resolving the minimum property field and ownership contract, and (4) explicitly deciding the audit boundary. Then request a fresh independent review; this report does not authorize T1 or any successor.
