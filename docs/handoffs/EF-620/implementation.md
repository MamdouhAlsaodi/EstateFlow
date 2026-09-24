# EF-620 — Admin and moderation — implementation

Status: **PASS within packet boundary** (`ESTATEFLOW-EF620-ADMIN-MODERATION-001`, executed with `zai/glm-5.3-flash`).

## Scope delivered

Platform-admin surface on top of the **existing EF-121 `PLATFORM_ADMIN` role** (no new roles): cross-tenant broker approval/suspension, listing moderation with mandatory reasons, bounded append-only audit search, and failed automation-job review. Sensitive privileged actions require a **mandatory reason plus step-up password re-authentication** bound to the current access session; every accepted transition is appended to a database-enforced, append-only admin audit trail.

## Authority model

- `PlatformAdminGuard` (new, `apps/api/src/features/admin/http/platform-admin.guard.ts`) demands a verified session whose principal carries `PLATFORM_ADMIN`. Applied to **every** admin route — including reads. Organization Owner/Manager authority grants nothing on the admin surface (integration-proven with an org Owner being 403'd).
- The application layer re-checks authority for every command/`query` (defense in depth).
- Broker approval **reuses** the EF-121 `ApproveBrokerMembership` application verbatim (it is already platform-admin-gated); no duplicate approval path was introduced.

## Routes (internal-only, OpenAPI-excluded)

All routes are `@ApiExcludeController()` per the EF-601/EF-610 precedent, so the closed-world OpenAPI document, generated client inventory, and `apps/api/test/openapi.test.mjs` are untouched (drift check green).

| Method | Route                                                                             | Guards                                  |
| ------ | --------------------------------------------------------------------------------- | --------------------------------------- |
| POST   | `admin/auth/step-up`                                                              | Origin + Session + CSRF + PlatformAdmin |
| GET    | `admin/brokers/pending`                                                           | Session + PlatformAdmin                 |
| POST   | `admin/organizations/:organizationId/brokers/:membershipId/approve`               | Origin + Session + CSRF + PlatformAdmin |
| POST   | `admin/organizations/:organizationId/brokers/:membershipId/suspend`               | same (sensitive: reason + step-up)      |
| POST   | `admin/organizations/:organizationId/brokers/:membershipId/reinstate`             | same (reason mandatory)                 |
| GET    | `admin/listings/moderation-queue`                                                 | Session + PlatformAdmin                 |
| POST   | `admin/organizations/:organizationId/listings/:listingId/moderation/approve`      | Origin + Session + CSRF + PlatformAdmin |
| POST   | `admin/organizations/:organizationId/listings/:listingId/moderation/reject`       | same (reason mandatory)                 |
| POST   | `admin/organizations/:organizationId/listings/:listingId/moderation/takedown`     | same (sensitive: reason + step-up)      |
| GET    | `admin/audit/events` (action / organizationId / actorId / cursor / limit filters) | Session + PlatformAdmin                 |
| GET    | `admin/automation/failed-jobs` (organizationId / cursor / limit filters)          | Session + PlatformAdmin                 |

Error mapping: 403 `ADMIN_FORBIDDEN` and 403 message `STEP_UP_REQUIRED`, 404 tenant-safe, 409 invalid state, 400 validation, 429 `STEP_UP_RATE_LIMITED` (bounded failed step-ups: 5 per 15 minutes per user).

## Step-up re-authentication

- `POST admin/auth/step-up` verifies the account password (Argon2id via the shared `NodeCryptoPasswordHasher`), then appends an `AdminStepUpEvent` bound to `(userId, familyId, accessSessionId)`. A `SUCCEEDED` proof expires after **10 minutes**; `DENIED` events are append-only abuse markers feeding the bounded deny limit.
- Proofs are bound to the exact access session, so a refresh rotation invalidates them; no password material is ever stored or logged.
- Sensitive actions (`BROKER_SUSPENDED`, `LISTING_MODERATION_TAKEN_DOWN`) require an unexpired proof for the calling session, checked at the application layer.

## Moderation state machine

- Every `Listing` now carries `moderationStatus` (default `PENDING`, migration backfills existing rows). The queue is `status = PUBLISHED AND moderationStatus = PENDING`, ordered oldest-first.
- `APPROVED` (reason optional) keeps the listing public. `REJECTED` (reason mandatory) and `TAKEN_DOWN` (reason mandatory + step-up) archive the listing — `ARCHIVED` is terminal in the EF-201 domain, so there is no moderation bypass by re-publishing.
- Each transition writes an append-only `ListingModerationEvent` (from/to moderation status, listing status before/after, reason, actor) **in the same transaction** as the listing update. Database CHECKs enforce reason-mandatory rules and archived-after-punitive decisions; a trigger makes the event table UPDATE/DELETE-proof.

## Bounded views (no raw payloads/secrets)

- Pending brokers: identity + state + org name only. No account identifiers, credentials, or hashes.
- Moderation queue: bounded property projection (title/type/identity/statuses/reasons).
- Audit events: action, target identity/type, actor, organization, reason, timestamp — nothing else.
- Failed jobs: typed statuses, attempt bookkeeping, and typed failure reasons (EF-306 projection semantics), **never** the execution key, event ids, or any payload. Read via parameterized raw SQL, preserving the EF-301 boundary (`AutomationJob` remains deliberately un-mirrored in `schema.prisma`).
- Keyset pagination (cursor = base64url `{at, id}`) on every list: queue ascending, audit/failed-jobs descending; `limit` bounded to 1–100 (default 50). No offset pagination anywhere.

## Schema + migration

`20261004000000_ef620_admin_moderation` (`apps/api/prisma/migrations`):

- `Listing`: `moderationStatus` (default `PENDING`), `moderationReason`, `moderatedBy` (FK→User), `moderatedAt`; unique `(organizationId, id)`; moderation-queue index.
- New enums `ListingModerationStatus`, `ListingModerationAction`, `AdminAuditAction`, `AdminStepUpOutcome`.
- `ListingModerationEvent`, `AdminAuditEvent`, `AdminStepUpEvent` — each with tenant/composite FKs, CHECK constraints, and **append-only triggers** (UPDATE/DELETE raise `check_violation`, proven by integration).
- `schema.prisma` mirrored accordingly (pre-approved deviation).

## Arabic-first admin console (lean, mobile-responsive)

`apps/web/src/app/ar/admin/`:

- `/ar/admin` — console hub.
- `/ar/admin/brokers` — pending queue + approve / suspend / reinstate with mandatory reason forms; suspend triggers the step-up prompt.
- `/ar/admin/listings` — moderation queue with approve / reject / takedown; takedown triggers the step-up prompt.
- `/ar/admin/audit` — filterable audit search (action + organization) with keyset «تحميل الأحدث».
- `/ar/admin/jobs` — cross-tenant failed jobs with typed failure reasons and org filter.

`apps/web/src/features/admin/`: strict normalizers (`admin-contract.ts`), typed Arabic labels (`admin-labels.ts`), CSRF-transported command adapter (`admin-api.ts`), shared `StepUpForm` re-auth component, and four views. On a sensitive command the API's `403` re-prompts for the password, then retries the command once. No raw payloads, secrets, account identifiers, or execution keys are rendered anywhere.

## Tests

Unit (`apps/api/test`):

- `ef620-admin.domain.test.mjs` — PLATFORM_ADMIN-only authority, sensitive-action set, mandatory/optional reason rules, step-up window math, keyset cursor round-trip + tamper rejection, page-limit bounds, stable error codes.
- `ef620-admin.application.test.mjs` — full authority matrix (non-admin/verified-false denied on every read/command), reason + step-up enforcement order, audited suspend/reinstate/approve (reusing EF-121), moderation transition matrix incl. cross-tenant mismatch never mutating another tenant, step-up deny-limit, keyset page/cursor behavior, org-filterable failed jobs.
- `ef620-admin.http.test.mjs` — AppModule wiring, exact route/verb inventory, guard composition per route, `ParseUUIDPipe` presence, OpenAPI exclusion metadata, guard denial matrix, domain→HTTP status mapping (403/404/409/400/429).

Integration (`estateflow_test`, `127.0.0.1:55435`, `ALLOW_DESTRUCTIVE_TESTS=1`):

- `ef620-admin.integration.test.mjs` — real PostgreSQL walk: privileged authorization denials, cross-tenant admin visibility (one admin, two tenants), secret-leak negatives, step-up denial→success with append-only DENIED event, audited suspend/reinstate/approve, moderation approve/reject/takedown with archived listings, conflict/tenant-safe paths, complete audit trail (reasons present, org filter, keyset walk without duplicates), DB trigger tamper rejection on all three append-only tables, bounded failed-jobs review (no execution key leakage), plus a real-HTTP boundary test (401 unauthenticated / 403 org-Owner / 200 admin / `STEP_UP_REQUIRED` / wrong-password 400 / tenant-safe 404 / invalid cursor 400).

Web (`apps/web/src/test/ef620-admin-contract.test.ts`): strict normalization of all admin payloads (malformed statuses/actions/attempts rejected), Arabic label coverage for every audited action and failure kind, keyset query serialization, step-up detection semantics.

## Gates (all green)

```text
pnpm lint                      PASS (workspace + infrastructure checks included)
pnpm typecheck                 PASS
pnpm test                      PASS — API unit suite: 65 files (incl. 3 new ef620-*), web 98/98
pnpm test:integration          PASS — API integration suite: 33 files on estateflow_test:55435 (incl. ef620-admin.integration.test.mjs)
pnpm build (API_ORIGIN=http://127.0.0.1:3000)  PASS
pnpm check:openapi-drift       PASS (no drift; openapi.test.mjs untouched)
git diff --check               PASS
prettier (touched files)       PASS
```

## Boundaries respected

- No new roles (reused `PLATFORM_ADMIN`); no `openapi.test.mjs` edits; no `apps/worker` changes; no dependency changes; no `.env` changes; no commit/push/deploy; no shared/live DB.
- Admin approval writes its audit event immediately after the reused EF-121 approval command (not in one transaction) — documented boundary; listing moderation and suspend/reinstate audit writes are transactional with the state change.
- Deferred to later packets: admin actor management (granting `PLATFORM_ADMIN`), per-listing moderation history UI, audit export.

## Evidence

- Unit: `node --test` — `apps/api/test/ef620-admin.*.test.mjs` (18 + 7 passing tests across domain/http; application suite incl. authority matrix).
- Integration: `apps/api/test/ef620-admin.integration.test.mjs` — 2/2 passing on `estateflow_test`.
- Web: `apps/web/src/test/ef620-admin-contract.test.ts` — 8/8 passing.
