# EF-201 Implementation Plan — Basic Property/Listing Workflow

## Plan metadata

- **Task:** EF-201-PLAN
- **Issued by:** Luna planner, `openai-codex/gpt-5.6-luna`, medium thinking, read-only
- **Status:** PASS
- **Goal:** Deliver the approved conservative EF-201 backend/API vertical slice through bounded implementation packets; keep web UI deferred.
- **G1 basis:** `docs/handoffs/EF-201-G1/approved-baseline.md`
- **Artifact:** `/home/server/projects/estateflow/docs/handoffs/EF-201-PLAN/implementation-plan.md`

## Approved scope lock

Implement only organization-owned Property and Listing records with:

- one active Listing per Property, with historical listings retained;
- Property states `ACTIVE` and `ARCHIVED`;
- Listing states `DRAFT`, `PUBLISHED`, and `ARCHIVED`;
- explicit create, update, publish, and archive commands;
- Owner and Manager management access;
- Broker read access to published listings only;
- no Client management or implicit PlatformAdmin tenant access;
- bounded textual address search only;
- a version field for optimistic concurrency;
- image metadata/upload abstraction using a replaceable test adapter;
- JPEG, PNG, and WebP validation, maximum 5 MiB per image, maximum 10 images per listing;
- organization/demo visibility for `PUBLISHED`, never public marketplace exposure;
- isolated PostgreSQL integration only through the existing destructive-test guard.

No destructive deletion, leads, viewings, deals, finance, maps/geo coordinates, external media provider, provider SDK, public publishing, outbox/worker processing, Docker/database administration, UI, commit, push, deploy, or live/shared database action is in scope.

## Existing contracts to preserve

- Authenticated HTTP requests use `BrowserSessionGuard`; unsafe browser mutations use canonical-origin and `CsrfGuard`.
- Every use case must require `actor.verified` and resolve an `ACTIVE` membership for the target organization.
- Organization roles and membership statuses remain owned by `apps/api/src/features/organizations`.
- Repository methods must be organization-scoped; no unconstrained global property/listing methods.
- Controllers remain thin: parse DTO, invoke one command/query, map typed outcomes.
- UUID identifiers and UTC timestamp conventions remain consistent with Prisma baseline.
- Cross-tenant access must not reveal whether a resource exists; use the existing typed not-found/forbidden convention.

# Execution packets

Each packet is one executor phase and has one writer. Each executor writes exactly one English report at its declared artifact path. The executor must record the pre-execution Git baseline (`git status --short` and `git diff --name-only`) before editing and the post-edit scope observation in its report. A verifier independently repeats the same baseline commands, inspects the allowed paths, runs the packet verification commands, and writes its own report. No packet authorizes its successor.

## T1 — EF-201 domain and persistence contract

**Goal:** Establish the property/listing/image domain vocabulary and Prisma persistence contract without implementing HTTP behavior.

**Depends on:** G2 approval; EF-121 and EF-104; no executor may start before explicit `execute T1` (G3).

**Allowed paths:**

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260802000000_ef201_property_listing/migration.sql`
- `apps/api/src/features/properties/domain/property-errors.ts`
- `apps/api/src/features/properties/domain/property-state.ts`
- `apps/api/src/features/properties/domain/property-policy.ts`
- `apps/api/src/features/properties/application/property.repository.ts`
- `apps/api/src/features/properties/properties.tokens.ts`
- `apps/api/src/features/properties/tests/domain/property-state.test.ts`
- `apps/api/src/features/properties/tests/domain/property-policy.test.ts`
- `docs/handoffs/EF-201/T1-executor.md`

**Deliverables and bounded decisions:**

- Model organization-owned `Property`, `Listing`, and listing-owned image metadata with UUIDs, UTC timestamps, organization indexes, and version fields.
- Represent the one-active-listing invariant in the persistence contract; use a database-safe constraint/index if Prisma cannot express it directly.
- Preserve listing history and forbid destructive deletion.
- Define provider-independent image metadata and upload lifecycle types; do not define a provider SDK or transport.
- Define repository ports for organization-scoped create/update/lifecycle/list/detail/image operations, including version preconditions and typed not-found/conflict results.
- Define only approved state transitions and writable-field boundaries; do not invent unapproved property fields beyond the minimum address/property facts needed by the approved contract. Any field ambiguity is a blocker, not an assumption.

**TDD:** Write domain transition, archive, version, image-count/type/size, and writable-field tests first; run each new test red for the expected missing behavior; implement the minimum domain policy; run green and existing unit regression before refactoring. Schema/migration generation is exempt from behavioral TDD but requires migration SQL review and schema validation.

**Verification commands:**

```bash
cd /home/server/projects/estateflow
pnpm exec prisma validate --schema apps/api/prisma/schema.prisma
pnpm format:check
pnpm test
pnpm typecheck
```

**Forbidden:** API controllers, runtime module wiring, UI, test database mutation, Docker, migration execution, external storage, generated client commits outside packet paths, dependency/config changes.

**Required reviewer lane:** Luna reviewer, `openai-codex/gpt-5.6-luna`; review domain invariants, tenant keys, version semantics, migration safety, exact scope, and TDD evidence. Reviewer artifact: `docs/handoffs/EF-201/T1-review.md`.

## T2 — EF-201 application commands, authorization, and image adapter port

**Goal:** Implement the backend use cases and authorization policy over the T1 ports, including create, update, publish, archive, list, detail, and image metadata operations.

**Depends on:** T1 executor and independent T1 review `PASS`; explicit `continue T2` (G4), then explicit `execute T2` (G3 for this packet).

**Allowed paths:**

- `apps/api/src/features/properties/domain/property-access.ts`
- `apps/api/src/features/properties/domain/property-errors.ts`
- `apps/api/src/features/properties/application/create-property.ts`
- `apps/api/src/features/properties/application/update-property.ts`
- `apps/api/src/features/properties/application/publish-listing.ts`
- `apps/api/src/features/properties/application/archive-listing.ts`
- `apps/api/src/features/properties/application/list-properties.ts`
- `apps/api/src/features/properties/application/get-property.ts`
- `apps/api/src/features/properties/application/manage-listing-images.ts`
- `apps/api/src/features/properties/application/image-storage.ts`
- `apps/api/src/features/properties/tests/application/property-commands.test.ts`
- `apps/api/src/features/properties/tests/application/property-queries.test.ts`
- `apps/api/src/features/properties/tests/application/property-images.test.ts`
- `docs/handoffs/EF-201/T2-executor.md`

**Deliverables and rules:**

- Encode the approved role matrix: Owner/Manager may create, update, publish, archive, and manage images; Broker may read published listings only; Client is denied; PlatformAdmin has no implicit access.
- Require verified actor plus active membership for every operation.
- Derive organization scope from the request actor and target membership, never from client-controlled authorization fields.
- Enforce state-specific field allowlists and separate command semantics.
- Enforce one active listing per property at application level as well as persistence level.
- Require the current version for mutable fact/lifecycle operations and return a typed conflict on stale writes.
- Keep published visibility organization/demo-only and prevent public audience options.
- Define an in-memory image adapter/test double behind the port; validate JPEG/PNG/WebP, 5 MiB, and ten-image limit without trusting client MIME/dimensions or arbitrary storage keys.
- Return not-found for cross-tenant resource access where the existing convention requires non-disclosure.

**TDD:** Add one behavior test at a time for authorization, inactive membership, cross-tenant denial, field allowlists, transitions, stale version, search scope, and image constraints. Verify red, implement minimum green, run full API unit regression, then refactor only while green.

**Verification commands:**

```bash
cd /home/server/projects/estateflow
pnpm test
pnpm typecheck
pnpm lint
```

**Forbidden:** Prisma implementation, schema/migration edits, HTTP routes, UI, role changes in organizations/auth, external provider, database/Docker, config/dependency edits.

**Required reviewer lane:** Luna reviewer, `openai-codex/gpt-5.6-luna`; independently inspect authorization matrix, tenant isolation, command separation, image trust boundary, and TDD red/green evidence. Reviewer artifact: `docs/handoffs/EF-201/T2-review.md`.

## T3 — EF-201 Prisma repositories and isolated PostgreSQL evidence

**Goal:** Implement persistence adapters for the approved domain/application ports and prove tenant, lifecycle, version, uniqueness, and image constraints against the isolated PostgreSQL database.

**Depends on:** T1 and T2 `PASS`; explicit `continue T3` then `execute T3`.

**Allowed paths:**

- `apps/api/src/features/properties/infrastructure/prisma-property.repository.ts`
- `apps/api/src/features/properties/infrastructure/property-mappers.ts`
- `apps/api/src/features/properties/tests/infrastructure/property.repository.integration.test.mjs`
- `apps/api/src/features/properties/tests/infrastructure/property.repository.unit.test.mjs`
- `apps/api/test/support/property-fixtures.mjs`
- `docs/handoffs/EF-201/T3-executor.md`

**Deliverables and rules:**

- Implement only organization-scoped Prisma queries and mappings.
- Enforce optimistic version updates atomically; map zero-row stale updates to typed conflict.
- Preserve history, non-destructive archive semantics, and the one-active-listing invariant.
- Persist provider-independent image metadata only; no upload bytes or provider credentials.
- Use the existing DI-managed Prisma boundary and existing isolated test-database cleanup conventions.
- Never run against a shared/live database; do not create or alter Docker/infra configuration.

**TDD and integration order:** Write repository unit tests first. For each integration behavior, write the test, run it red against the missing adapter/constraint, implement the minimum adapter/SQL mapping, run green, then run the complete authorized integration suite. Integration mutation is permitted only after the established guard has passed and the target is proven disposable.

**Verification commands:**

```bash
cd /home/server/projects/estateflow
ALLOW_DESTRUCTIVE_TESTS=1 pnpm test:integration -- apps/api/src/features/properties/tests/infrastructure/property.repository.integration.test.mjs
pnpm test
pnpm typecheck
```

The executor must include the guard's literal target-database assertion and cleanup result in its report. If the guard or isolated database is unavailable, status is `BLOCKED`/`PARTIAL`; do not substitute a live or shared database.

**Forbidden:** schema/migration changes (T1 owns them), controllers, UI, external storage, Docker/service changes, database reset outside the established guard.

**Required reviewer lane:** Luna reviewer, `openai-codex/gpt-5.6-luna`; independently inspect SQL/Prisma scope, tenant predicates, conflict behavior, cleanup proof, and database evidence. Reviewer artifact: `docs/handoffs/EF-201/T3-review.md`.

## T4 — EF-201 HTTP/API contract and runtime wiring

**Goal:** Expose the approved application behavior through thin NestJS HTTP adapters and register the feature without changing auth or organization contracts.

**Depends on:** T2 and T3 `PASS`; explicit `continue T4` then `execute T4`.

**Allowed paths:**

- `apps/api/src/features/properties/http/property.controller.ts`
- `apps/api/src/features/properties/http/property.dto.ts`
- `apps/api/src/features/properties/http/property.http-errors.ts`
- `apps/api/src/features/properties/properties.module.ts`
- `apps/api/src/app.module.ts`
- `apps/api/src/features/properties/tests/http/property.http.test.mjs`
- `apps/api/src/features/properties/tests/http/property.http.integration.test.mjs`
- `apps/api/test/openapi.test.mjs`
- `docs/handoffs/EF-201/T4-executor.md`

**Deliverables and API boundary:**

- Add distinct routes for property/listing create, update, publish, archive, list, detail, and image metadata operations. Exact route names must be recorded in the executor report and match the approved DTO contract; do not add public routes.
- Validate UUIDs, query filters, pagination, sort, body fields, image metadata, and unknown writable fields at the HTTP boundary.
- Map success, validation, unauthorized, forbidden, not-found, conflict, and invalid-transition outcomes to the existing API error conventions.
- Apply `BrowserSessionGuard` to reads and the canonical-origin/session/CSRF guard set to unsafe browser mutations.
- Keep controllers thin and use cases responsible for authorization and business rules.
- Update only the generated API contract artifacts that are already owned by the existing OpenAPI mechanism if required by the API build; no hand-maintained client/UI implementation.

**TDD:** Write HTTP contract tests before controller changes; verify red, implement the smallest adapter, verify green, then run OpenAPI drift and API regression tests. Include cross-tenant, inactive-member, Broker/Client, stale-version, malformed-input, and invalid-transition cases.

**Verification commands:**

```bash
cd /home/server/projects/estateflow
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

**Forbidden:** web files, API client/UI feature work, auth/org edits, public exposure, real provider, database/Docker administration, config/dependency edits.

**Required reviewer lane:** Luna reviewer, `openai-codex/gpt-5.6-luna`; verify route/DTO/error contract, guard ordering, thin-controller boundary, OpenAPI evidence, and exact changed paths. Reviewer artifact: `docs/handoffs/EF-201/T4-review.md`.

## T5 — EF-201 end-to-end backend verification and handoff

**Goal:** Independently verify the complete backend/API slice and produce release-readiness evidence without changing source.

**Depends on:** T4 executor and review `PASS`; explicit `continue T5` then `execute T5`.

**Allowed paths:**

- `docs/handoffs/EF-201/T5-verification.md`

**Read-only source scope:** all T1–T4 allowed source paths, existing auth/organization contracts, and the packet-declared test files. No source edits.

**Verification contract:**

- Recompute the pre-EF-201 baseline from Git and confirm only packet-listed paths changed.
- Run the full canonical suite: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`, and `pnpm format:check`; integration requires the existing guard and isolated PostgreSQL.
- Confirm every approved role/action cell, lifecycle transition, cross-tenant denial, stale-version conflict, search scope, image limit/type/size, and HTTP error outcome has explicit test evidence.
- Confirm no public publishing, provider integration, map/geo behavior, UI work, or destructive deletion was introduced.
- Use Luna review lane only; no repair or source edit is allowed. Any failure creates a new narrowly approved repair packet.

**Reviewer artifact:** `docs/handoffs/EF-201/T5-verification.md` is the independent Luna verification artifact. It must include literal command output, before/after scope evidence, cleanup evidence, risks, and a `PASS | PARTIAL | BLOCKED` status.

# Executor/reviewer operating contract

- **Executor lane:** `yui-backend` / Luna executor, provider `openai-codex`, model `gpt-5.6-luna`, medium thinking. Invoke with explicit provider/model flags; verify resulting session JSONL metadata (`provider`, `modelId`) before accepting the report.
- **Reviewer lane:** `yui-review` / Luna reviewer, provider `openai-codex`, model `gpt-5.6-luna`, medium thinking. Reviewer never edits source, never repairs, never commits, and never authorizes the next task.
- Each executor and reviewer writes exactly its one declared handoff artifact. Reports must include goal, allowed paths used, files changed, commands and literal output, status, risks, documentation impact, Git/publication posture, and recommended next human decision.
- A timeout/cancellation/signal ends that phase as `PARTIAL` or `BLOCKED`; no silent retry or auto-resume. A repair requires a new packet with a fresh task ID, narrow paths, fresh TDD and verification evidence.
- The executor must not widen allowed paths when a compiler, generator, migration, or test requests unrelated changes. Stop and request a new packet.

# Scope-baseline evidence contract

1. Before T1 starts, the coordinator records the Git baseline using:

   ```bash
   cd /home/server/projects/estateflow
   git status --short
   git diff --name-only
   ```

   The baseline is attached to the T1 packet and carried forward unchanged.
2. Before each later executor, the coordinator records the same two commands and confirms the prior phase's expected paths are the only pre-existing deltas.
3. Each executor records pre/post observations; each reviewer independently repeats them and inspects the resulting diff.
4. Any path outside the current packet, including generated artifacts not explicitly listed, is a scope failure and prevents `PASS` until a new packet is approved.
5. The final verifier must explicitly confirm that this planning artifact is the only file changed by the planning phase and that no source/config/schema/test/database/Docker file was changed during planning.

# Documentation and API governance

This feature changes domain, persistence, authorization, API, and image contracts. Before implementation, the CTO must decide whether to update `docs/CURRENT_HANDOFF.md`, `docs/TASKS.md`, `docs/YUI_TECHNICAL_CONTEXT.md`, or a dedicated API/ADR document in a separate docs packet. No implementation packet may silently edit those documents.

The typed API/OpenAPI contract must be verified before any UI packet. The named deferred task is:

- **EF-201-WEB — Arabic-first Property/Listing web UI:** a separate frontend packet after T4/T5 API contract verification and explicit G4 approval. It may consume the verified typed API client, but it is not part of EF-201 backend execution and must not be included in T1–T5.

# Explicit gates

- **G1 — satisfied:** Mamdouh approved the conservative baseline in `docs/handoffs/EF-201-G1/approved-baseline.md`.
- **G2 — required now:** Mamdouh must approve this exact implementation plan, packet boundaries, allowed paths, TDD requirements, verification commands, and deferred `EF-201-WEB` task. No executor packet may be issued before exact G2 approval.
- **G3 — required per packet:** after G2, Mamdouh must explicitly issue `execute T1`, `execute T2`, `execute T3`, or `execute T4` for the named packet. T5 requires explicit `execute T5` after T4 review. No packet auto-advances.
- **G4 — required between packets:** after executor and independent review of T<n> both return `PASS`, Mamdouh must explicitly issue `continue T<n+1>`. A review `PARTIAL` or `BLOCKED` stops progression and requires a new repair packet.
- **G5/G6 — not granted:** no commit or push approval is included. No deployment or publication is authorized.

# Planner evidence

## Allowed paths used

- Read-only sources declared by `/home/server/.pi/agent/packets/EF-201-PLAN.json`, including the approved G1 baseline, requirements handoff, current handoff, task/development plans, technical context, Prisma schema, and auth/organization contracts/tests.
- Wrote only `/home/server/projects/estateflow/docs/handoffs/EF-201-PLAN/implementation-plan.md`.

## Files changed

- `/home/server/projects/estateflow/docs/handoffs/EF-201-PLAN/implementation-plan.md` only.

## Commands run

- Read-only inspection of all packet-declared planning sources.
- Artifact existence verification after writing (recorded below).

## Status and next decision

**PASS** — the bounded backend/API-first plan is complete for G2 review. The next human decision is exact G2 approval; after approval, issue only the named packet's G3 command.
