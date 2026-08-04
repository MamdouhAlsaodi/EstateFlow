# EF-201 Replacement Implementation Plan — R1

## Plan metadata

- **Task:** EF-201-PLAN-R1
- **Planner lane:** `openai-codex/gpt-5.6-luna`, medium thinking, read-only
- **Status:** PASS — replacement plan only; G2/G3/G4 are not granted.
- **Goal:** Implement the approved organization-scoped Property/Listing backend slice with discoverable tests, executable isolated integration evidence, an exact minimum data/API contract, and no audit or web-UI expansion.
- **G1 basis:** `docs/handoffs/EF-201-G1/approved-baseline.md` and `docs/handoffs/EF-201-G1/approved-amendment.md`
- **Replacement artifact:** `/home/server/projects/estateflow/docs/handoffs/EF-201-PLAN-R1/implementation-plan.md`

## Non-negotiable scope

Implement only organization-owned properties, historical listings, and provider-independent image metadata. Preserve:

- Property states `ACTIVE | ARCHIVED`; Listing states `DRAFT | PUBLISHED | ARCHIVED`.
- One active listing per property; history is retained.
- Owner and Manager may manage; Broker may read published listings only; Client is denied; PlatformAdmin has no implicit tenant access.
- Verified actor plus active target-organization membership for every operation.
- Organization-derived authorization scope, UUID identifiers, UTC timestamps, optimistic `version` preconditions, and cross-tenant non-disclosure.
- Text search only; no coordinates, maps, financial fields, extra PII, public marketplace exposure, external media provider, binary upload endpoint, or UI.
- No destructive deletion. Property/listing/image feature audit events are explicitly deferred; the existing `SecurityAuditEvent` model is not repurposed.

No implementation, migration execution, database/Docker action, shared/live database use, commit, push, deploy, or publication is authorized by this plan.

## Exact minimum data contract for G2 approval

These are the complete EF-201 persisted fields. No additional property facts, contact records, User relations, coordinates, financial fields, or PII may be added without a new decision packet.

### `Property`

- `id: UUID` primary identifier
- `organizationId: UUID` tenant owner and required relation to `Organization`
- `title: string` required bounded display text
- `propertyType: string` required bounded classification text; no unapproved enum vocabulary
- `addressText: string` required bounded searchable address text; stored as operational text only
- `ownerReference: string | null` optional bounded operational reference text; not a User relation or contact record
- `status: ACTIVE | ARCHIVED`
- `version: integer` required optimistic-concurrency value
- `createdAt`, `updatedAt`: UTC timestamps

### `Listing`

- `id: UUID` primary identifier
- `organizationId: UUID` required tenant key
- `propertyId: UUID` required relation to `Property` in the same organization
- `status: DRAFT | PUBLISHED | ARCHIVED`
- `version: integer` required optimistic-concurrency value
- `createdAt`, `updatedAt`: UTC timestamps

The persistence contract must enforce same-organization property/listing ownership and one `PUBLISHED` listing maximum per property with a database-safe partial unique index/migration where Prisma cannot express it. Lifecycle archive is non-destructive.

### Image metadata

Persist only `id: UUID`, `listingId: UUID`, `mediaType: JPEG | PNG | WEBP`, `byteSize: integer`, `position: integer`, `createdAt`, and `updatedAt`. There is no persisted client URL, binary, provider credential, or client-chosen storage key. A replaceable test adapter may hold an internal opaque reference outside the HTTP contract. Validation is server-side: accepted types JPEG/PNG/WebP, maximum 5 MiB, maximum 10 metadata records per listing; client MIME/dimensions are not trusted.

## Exact HTTP/API contract for G2 approval

All routes are organization-scoped and authenticated. Organization IDs, property IDs, listing IDs, and image IDs are UUID path parameters. Reads use `BrowserSessionGuard`; every mutation uses `[RequireCanonicalOriginGuard, BrowserSessionGuard, CsrfGuard]`. Controllers parse/validate and map outcomes; application commands/queries enforce authorization and invariants.

### DTOs and responses

- `CreatePropertyDto`: `{ title, propertyType, addressText, ownerReference? }`; response `201 PropertyResponse`.
- `UpdatePropertyDto`: `{ version, title?, propertyType?, addressText?, ownerReference? }`; response `200 PropertyResponse`.
- `CreateListingDto`: `{ version }`; creates a `DRAFT`; response `201 ListingResponse`.
- `LifecycleListingDto`: `{ version }`; response `200 ListingResponse`.
- `CreateImageMetadataDto`: `{ mediaType, byteSize, position }`; response `201 ImageMetadataResponse`.
- `PropertyResponse`: the exact Property fields plus `activeListing: ListingResponse | null`.
- `ListingResponse`: the exact Listing fields plus `images: ImageMetadataResponse[]` where returned by detail/create operations.
- `ImageMetadataResponse`: the exact persisted image metadata fields.
- `CursorPage<T>`: `{ items: T[], nextCursor: string | null }`.

`limit` is optional and defaults to the implementation's documented default; it is an integer constrained to `1..50`. `cursor` is an opaque cursor. Property list search uses optional bounded `search`, applied only to `title` and `addressText`; no sort or filter fields beyond `search`, `cursor`, and `limit` are accepted.

### Routes

- `POST /organizations/:organizationId/properties` — create Property.
- `PATCH /organizations/:organizationId/properties/:propertyId` — update Property with required current `version`.
- `GET /organizations/:organizationId/properties` — organization-scoped `CursorPage<PropertyResponse>`; management roles see organization properties, Broker sees only properties with a `PUBLISHED` listing.
- `GET /organizations/:organizationId/properties/:propertyId` — same visibility rule as list; cross-tenant/missing resources return indistinguishable not-found.
- `POST /organizations/:organizationId/properties/:propertyId/listings` — create the property's one active draft listing; body is `CreateListingDto`.
- `POST /organizations/:organizationId/listings/:listingId/publish` — publish with `LifecycleListingDto`.
- `POST /organizations/:organizationId/listings/:listingId/archive` — archive with `LifecycleListingDto`.
- `GET /organizations/:organizationId/listings/:listingId` — detail subject to published-only Broker visibility.
- `POST /organizations/:organizationId/listings/:listingId/images` — register validated image metadata only; no bytes are accepted.
- `GET /organizations/:organizationId/listings/:listingId/images` — return `ImageMetadataResponse[]`.

No image DELETE route, binary upload route, public route, arbitrary audience option, or public URL is included.

### Error contract

Use the existing Nest HTTP conventions: `400` for malformed UUID, unknown field, invalid body, invalid query, unsupported image metadata, size/limit violation, or invalid transition; `401` for missing/invalid session; `403` for authenticated Client, inactive membership, or unauthorized management action; `404` for missing/cross-tenant/invisible resources; `409` for stale `version` or one-active-listing uniqueness conflict. Error bodies remain the existing framework-safe shape and must not disclose tenant/resource existence. No new error envelope or security-audit event is introduced.

## Test locations and discovery contract

All new tests must be directly discoverable under the existing API roots; do not place EF-201 tests under `apps/api/src/**`:

- Unit/domain/application tests: `apps/api/test/ef201-property.domain.test.mjs`, `apps/api/test/ef201-property.application.test.mjs`, `apps/api/test/ef201-property.images.test.mjs`.
- Repository unit test: `apps/api/test/ef201-property.repository.unit.test.mjs`.
- Direct isolated repository integration test: `apps/api/test/ef201-property.repository.integration.test.mjs`.
- HTTP contract test: `apps/api/test/ef201-property.http.test.mjs`.
- Direct isolated HTTP integration test: `apps/api/test/ef201-property.http.integration.test.mjs`.
- OpenAPI assertions extend the existing `apps/api/test/openapi.test.mjs` only if that file is already packet-approved for the API contract change.

Each executor records literal RED and GREEN runs for each named new test file, then separately records the package-wide regression. Root `pnpm test` is regression evidence only; it is not evidence that nested feature tests ran.

## Runtime and executable verification precondition

Every command in every executor and reviewer report must begin with:

```bash
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow &&
```

The report must record `node --version` = `v24.14.1` and `pnpm --version` = `10.33.2`. No provider, package manager, or Node-version fallback is permitted. A missing command before this precondition is an environment block, not a code result.

## Execution packets

### T1 — domain and persistence contract

**Depends on:** explicit G2 approval, then explicit `execute T1` (G3). **Allowed paths:** `apps/api/prisma/schema.prisma`, the EF-201 migration path, `apps/api/src/features/properties/**` domain/application ports, the four T1 unit test files under `apps/api/test/`, and `docs/handoffs/EF-201/T1-executor.md`.

Implement the exact fields, relations, indexes, partial uniqueness, state transitions, writable-field allowlists, version semantics, and image validation policy above. Run named tests directly, for example:

```bash
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && node --test apps/api/test/ef201-property.domain.test.mjs apps/api/test/ef201-property.application.test.mjs apps/api/test/ef201-property.images.test.mjs
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm test
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm typecheck
```

Do not execute migrations or use a database in T1. Record RED before implementation and GREEN after it.

### T2 — application commands and authorization

**Depends on:** T1 executor/review `PASS`, explicit `continue T2` (G4), then `execute T2` (G3). **Allowed paths:** application/domain feature paths only, the three named application test files under `apps/api/test/`, and `docs/handoffs/EF-201/T2-executor.md`.

Implement the role matrix, active-membership/verified-actor checks, tenant non-disclosure, command separation, version conflicts, search, and metadata-only image adapter. Direct verification:

```bash
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && node --test apps/api/test/ef201-property.application.test.mjs apps/api/test/ef201-property.images.test.mjs
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm test
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm lint && pnpm typecheck
```

### T3 — Prisma repositories and isolated PostgreSQL evidence

**Depends on:** T1/T2 `PASS`, explicit `continue T3`, then `execute T3`. **Allowed paths:** Prisma repository/mappers, `apps/api/test/ef201-property.repository.unit.test.mjs`, `apps/api/test/ef201-property.repository.integration.test.mjs`, test support fixture, and `docs/handoffs/EF-201/T3-executor.md`.

The named integration command is direct and isolated; the path is not passed as an argument to the recursive script:

```bash
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm db:test:guard
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run db:migrate:test
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run build
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && ALLOW_DESTRUCTIVE_TESTS=1 node --test --test-concurrency=1 apps/api/test/ef201-property.repository.integration.test.mjs
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && node --test apps/api/test/ef201-property.repository.unit.test.mjs
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm test
```

The executor must record the guard's literal target assertion and cleanup assertion. The guard must pass before migration or test mutation. If guard, disposable PostgreSQL, migration, or cleanup proof is unavailable, report `BLOCKED`/`PARTIAL`; never substitute another database. The approved test migration is the only migration execution authorized for this packet.

### T4 — HTTP/API contract and runtime wiring

**Depends on:** T2/T3 `PASS`, explicit `continue T4`, then `execute T4`. **Allowed paths:** properties HTTP/module/app wiring paths, `apps/api/test/ef201-property.http.test.mjs`, `apps/api/test/ef201-property.http.integration.test.mjs`, existing OpenAPI test only if listed in the issued packet, and `docs/handoffs/EF-201/T4-executor.md`.

Implement exactly the routes, DTOs, responses, guards, and errors above; do not add fields/routes. Direct test evidence must include:

```bash
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && node --test apps/api/test/ef201-property.http.test.mjs
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm db:test:guard
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run db:migrate:test
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run build
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && ALLOW_DESTRUCTIVE_TESTS=1 node --test --test-concurrency=1 apps/api/test/ef201-property.http.integration.test.mjs
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm lint && pnpm typecheck && pnpm build
```

### T5 — independent backend verification

**Depends on:** T4 executor/review `PASS`, explicit `continue T5`, then `execute T5`. **Allowed path:** only `docs/handoffs/EF-201/T5-verification.md`. Re-run direct named unit/integration/HTTP commands above plus the canonical regression commands, with the nvm precondition on every command, and independently confirm role cells, lifecycle, tenant isolation, version conflicts, search, image limits, error contract, no public exposure, no audit event, and no UI.

## Gates and documentation

- **G1:** satisfied by the two approved artifacts.
- **G2:** required for this exact replacement plan, including the minimum field/ownership contract and exact HTTP contract. This plan does not grant G2.
- **G3:** explicit `execute T1` through `execute T5`, one packet at a time.
- **G4:** explicit `continue T<n+1>` only after executor and independent reviewer `PASS`.
- **G5/G6:** not granted; no commit or push.
- Any README, technical context, task list, or ADR update requires a separate approved documentation packet. `EF-201-WEB` remains deferred until T4/T5 API verification and a separate explicit approval.

## Planner evidence

### Allowed paths used

Read only the packet-declared G1 artifacts, prior plan/review, package manifests, Prisma schema, and existing API/module/test convention files. Wrote only this replacement artifact.

### Files changed

- `/home/server/projects/estateflow/docs/handoffs/EF-201-PLAN-R1/implementation-plan.md`

### Commands/actions

- Read-only file inspection through the approved packet sources.
- No source/config/schema/test edit, database/Docker/migration execution, commit, push, deploy, or publication.

### Status and next decision

**PASS** — every independent-review blocker is concretely addressed in this replacement plan. The next human decision is exact G2 approval; no executor may begin before it.
