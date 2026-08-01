# EF-121 Implementation Plan — Organization Membership and RBAC

- **Task ID:** EF-121-PLAN
- **Status:** PASS
- **Goal:** Define the bounded implementation of organization membership, RBAC, ownership, broker approval, and cross-tenant denial before product-source work starts.
- **Approved G1 input:** Mamdouh explicitly approved starting EF-121 on 2026-07-31.
- **Planning scope used:** Only the packet-listed source-of-truth documents, EF-120 authentication symbols, schema, composition, and API test patterns.

## 1. Scope and safe defaults

### In scope

1. Persist organizations and exactly one immutable initial Owner membership per organization.
2. Persist one membership per `(organizationId, userId)` with role and lifecycle state.
3. Use fixed, code-owned role-to-permission mapping; do not create tenant-editable roles or permissions.
4. Create the smallest authenticated HTTP vertical slice: create/read an organization, create/list/read-self memberships, and approve a pending broker membership.
5. Enforce verified-user, cookie-session, CSRF/origin, status, role, and tenant checks in the API.
6. Add isolated PostgreSQL migration/integration coverage and a local runtime smoke check using synthetic records only.

### Out of scope

- Web UI, UI hiding, invitation email/delivery, organization search, organization deletion, ownership transfer, custom roles, bulk membership actions, user-directory lookup, tenant business entities, mobile/bearer authentication, external providers, and EF-620's wider moderation/admin surface.
- Platform-admin assignment or management endpoints. Assignment is operational/bootstrap-only and has no HTTP route in EF-121.
- Session token contents, cookie names/lifetimes, cookie storage, session rotation/revocation, canonical-origin behavior, CSRF behavior, auth abuse controls, and security-audit schema changes. EF-121 consumes EF-120; it does not weaken or duplicate it.

### Chosen defaults and rationale

| Topic | Decision |
| --- | --- |
| Tenant boundary | `Organization` is the tenant root. A user is scoped by a current, persisted membership on every protected organization request; no tenant ID is accepted from a session or trusted from the request body. |
| Roles and permissions | Fixed `OWNER`, `MANAGER`, `BROKER`, `CLIENT` organization roles and a code-owned permission map. This is the smallest auditable RBAC model and avoids premature custom-role administration. |
| Platform authority | `PLATFORM_ADMIN` is a separate global `User.platformRole`, default `NONE`; it is never an organization membership role and never implies tenant membership. Its sole EF-121 permission is pending-broker approval. |
| Broker approval | A newly created Broker membership is always `PENDING`. Only a verified PlatformAdmin can transition it to `ACTIVE`; store the approval time and approver user ID. This implements the required approval boundary while deferring broader EF-620 moderation. |
| Other membership creation | Owner/Manager may create a verified target user's `CLIENT` membership directly as `ACTIVE`, or submit a verified target user as a pending `BROKER`. Manager cannot create/manage Owners or Managers. |
| Ownership | `POST /organizations` atomically creates the organization and its sole `OWNER`/`ACTIVE` membership. EF-121 exposes no owner transfer, owner suspension, or owner revocation, preventing an ownerless organization. |
| Membership lifecycle | `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`. EF-121 writes only `PENDING` (Broker creation) and `ACTIVE` (Owner/Client creation and PlatformAdmin approval); later lifecycle management is deferred. The state model and policy deny any non-active membership. |
| Verified users | Every EF-121 endpoint requires `SessionPrincipal.verified === true`. The membership target must already be verified. This prevents unverified accounts from obtaining tenant access or pending workflow state. |

No unresolved product or architecture decision requires Mamdouh: the above are conservative defaults consistent with the approved roadmap and keep unapproved capabilities out of the first vertical slice.

## 2. Persistence and invariants

### Prisma representation

Add the following models/enums in the EF-121 migration and schema:

- `PlatformRole`: `NONE`, `PLATFORM_ADMIN`; `User.platformRole` is non-null and defaults to `NONE`.
- `OrganizationRole`: `OWNER`, `MANAGER`, `BROKER`, `CLIENT`.
- `MembershipStatus`: `PENDING`, `ACTIVE`, `SUSPENDED`, `REVOKED`.
- `Organization`: UUID `id`, non-empty bounded `name`, `createdAt`, `updatedAt`, and `memberships`.
- `Membership`: UUID `id`; required `organizationId`, `userId`, `role`, `status`, `createdAt`, `updatedAt`; nullable `approvedAt`, `approvedByUserId`; relations to organization, member user, and approving user.

Required relational/index invariants:

1. Foreign keys from `Membership` to `Organization`, member `User`, and approving `User`; delete behavior must not permit accidental removal of an organization or user with memberships.
2. `@@unique([organizationId, userId])` prevents duplicate or parallel membership rows.
3. Indexes for tenant authorization/listing: `(organizationId, status)`, `(organizationId, role, status)`, and `(userId, status)`.
4. A PostgreSQL check constraint requires every `OWNER` row to remain `ACTIVE`.
5. A PostgreSQL partial unique index permits at most one `OWNER` row per organization. The create-organization transaction establishes at least one.
6. Application validation requires `approvedAt` and `approvedByUserId` only for a PlatformAdmin approval transition; no raw role/status strings cross the domain boundary.

`Organization` creation and initial Owner membership must execute in one Prisma transaction. Constraint conflicts are mapped to a typed domain conflict, not leaked as database errors.

### Migration safety

- Use one forward-only, reviewable Prisma migration containing enum creation, additive `User.platformRole` with default `NONE`, the two tables, foreign keys, indexes, check constraint, and partial unique index. Do not edit EF-120 migrations.
- Run migration generation/replay and integration tests only against the existing isolated PostgreSQL test target with `ALLOW_DESTRUCTIVE_TESTS=1`; never run migration, truncate, cleanup, or smoke commands against shared/live databases.
- The migration must be safe for existing EF-120 users: they receive `NONE`, no organization, and no implicit membership. No real records are created or backfilled.
- Test cleanup must extend the explicit FK-safe allowlist only with the new test tables and must leave the isolated target empty. No down migration is introduced.

## 3. Authorization policy and HTTP contract

### Boundary sequence

All organization routes first use EF-120 cookie authentication. Unsafe methods retain the exact EF-120 guard order:

`RequireCanonicalOriginGuard → BrowserSessionGuard → CsrfGuard → VerifiedSessionGuard → permission/tenant policy`.

Safe reads use `BrowserSessionGuard → VerifiedSessionGuard → permission/tenant policy`. `VerifiedSessionGuard` reads only `request.auth` / `SessionPrincipal`; it neither reparses cookies nor changes session issuance. Authorization loads the current membership/status from persistence per request, so suspension/revocation applies immediately without modifying cookies or sessions.

A caller without a valid access session receives the existing `401`. An authenticated but unverified caller receives `403` before tenant lookup. For a well-formed organization or membership identifier, absent tenant resources and non-members receive the same generic `404` response/body. An in-tenant active member that lacks a permitted command receives generic `403`. UI visibility is not an authorization control and no route relies on it.

### Fixed permissions and matrix

| Capability | Owner | Manager | Broker pending | Broker active | Client | Non-member | PlatformAdmin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Create own organization | yes | yes | yes | yes | yes | yes | yes |
| Read organization summary | yes | yes | no | yes | yes | generic 404 | no implicit access |
| List organization memberships | yes | yes | no | no | no | generic 404 | no implicit access |
| Read own membership status | yes | yes | yes | yes | yes | generic 404 | no implicit access |
| Create Client membership | yes | yes | no | no | no | generic 404 | no |
| Submit pending Broker membership | yes | yes | no | no | no | generic 404 | no |
| Create/alter Owner or Manager membership | no endpoint | no | no | no | no | generic 404 | no |
| Approve pending Broker membership | no | no | no | no | no | generic 404 | yes, approval-only |
| Access another tenant through any role | no | no | no | no | no | generic 404 | no |

All entries marked `yes` still require a valid, verified EF-120 `SessionPrincipal`. Broker pending may read only its own membership state; it cannot read organization data. PlatformAdmin can approve only a supplied pending-Broker membership and receives no organization/membership listing, read, creation, or implied tenant role.

### Thin route/use-case pairs

| Route | Guards/policy | Use case | Result |
| --- | --- | --- | --- |
| `POST /organizations` | origin, browser session, CSRF, verified | `CreateOrganization` | `201` organization summary; creates the caller's active Owner membership atomically. |
| `GET /organizations/:organizationId` | browser session, verified, active-membership `organization.read` | `GetOrganization` | `200` summary; non-member/absent is generic `404`. |
| `GET /organizations/:organizationId/memberships` | browser session, verified, active `membership.list` | `ListOrganizationMemberships` | `200` minimal membership list; unauthorized role `403`, non-member/absent `404`. |
| `GET /organizations/:organizationId/memberships/me` | browser session, verified, self-membership lookup | `GetMyMembership` | `200` caller's minimal role/status; pending permitted; non-member/absent `404`. |
| `POST /organizations/:organizationId/memberships` | origin, browser session, CSRF, verified, active `membership.create` | `CreateMembership` | `201`; only Client (active) or Broker (pending) target role accepted. |
| `POST /platform/broker-memberships/:membershipId/approve` | origin, browser session, CSRF, verified, platform approval permission | `ApproveBrokerMembership` | `204`; only `PENDING` Broker can become `ACTIVE`, with approver/time persisted; invalid/non-pending input is a typed conflict without mutation. |

Request/response DTOs contain only UUIDs, role/status, and bounded organization display fields; they never expose credentials, cookies, session fields, account identifiers, or arbitrary user records.

## 4. TDD and verification order

For each executable slice, the executor follows RED → minimal GREEN → regression:

1. Write the named test for one invariant/authorization behavior and run it to observe the intended failure.
2. Add only the domain/persistence/HTTP code required to make that test pass.
3. Run the slice test set, then the relevant API regression set.
4. Before handoff, run the canonical workspace checks applicable to changed code: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, `pnpm build`, and `pnpm format:check`.

Minimum RED cases: duplicate membership conflict; initial Owner transaction rollback; owner constraint; `PENDING` Broker denial; unverified-session denial; Client/Broker forbidden management command; non-member tenant-A-to-tenant-B generic denial with no mutation; PlatformAdmin-only approval; approval idempotency/conflict; CSRF/origin rejection with no mutation; and no status/role bypass by request payload.

Integration tests use dynamically generated synthetic IDs/account identifiers and the isolated PostgreSQL target only. They must verify the migration constraints/index behavior as observable outcomes, concurrent creation/approval safety where practical, and explicit cleanup. Unit tests use fakes for repository/clock/session dependencies and preserve the existing compiled-`dist` Node test pattern.

Runtime smoke is a local, test-configured Nest application with synthetic verified principals and the isolated test database: exercise owner creation, pending broker submission, PlatformAdmin approval, successful active-broker organization read, and cross-tenant `404`; then verify cleanup. It must use the existing EF-120 cookie/origin/CSRF test configuration and must not introduce an environment file, real secret, real account, or running external service. If the local harness cannot be run, the verifier reports `PARTIAL`, not `PASS`.

## 5. Executable packet sequence

### EF-121-I — Persistence, domain policy, and use cases

- **Depends on:** G2 approval of this plan, then exact G3 `execute EF-121-I`.
- **Target symbols:** Prisma `Organization`/`Membership`/role-status-platform enums and migration; `OrganizationRepository`; fixed permission policy; `CreateOrganization`, `CreateMembership`, `GetOrganization`, `GetMyMembership`, `ListOrganizationMemberships`, and `ApproveBrokerMembership`; Prisma repository adapter.
- **Allowed paths:**
  - `/home/server/projects/estateflow/apps/api/prisma/schema.prisma`
  - `/home/server/projects/estateflow/apps/api/prisma/migrations/<approved-timestamp>_ef121_organization_rbac/migration.sql`
  - `/home/server/projects/estateflow/apps/api/src/features/organizations/domain/**`
  - `/home/server/projects/estateflow/apps/api/src/features/organizations/application/**`
  - `/home/server/projects/estateflow/apps/api/src/features/organizations/infrastructure/prisma-organization.repository.ts`
  - `/home/server/projects/estateflow/apps/api/test/organization.application.test.mjs`
  - `/home/server/projects/estateflow/apps/api/test/organization.repository.integration.mjs`
  - `/home/server/projects/estateflow/docs/handoffs/EF-121-I/worker-report.md`
- **Forbidden paths:** all other product paths; `apps/web/**`, `apps/worker/**`, dependency manifests/lockfiles, `.env*`, auth security/session source, shared/live DB targets, and Git metadata.
- **Acceptance:** atomic Owner creation; default global role; all listed schema invariants; fixed role policy; pending Broker creation; PlatformAdmin-only atomic approval; typed conflicts; unit RED/GREEN and isolated repository integration evidence.
- **Report path:** `/home/server/projects/estateflow/docs/handoffs/EF-121-I/worker-report.md`

### EF-121-II — Nest composition and protected HTTP vertical slice

- **Depends on:** EF-121-I independent verification PASS, then exact G3 `execute EF-121-II`.
- **Target symbols:** organization module/tokens/controller/DTOs; `VerifiedSessionGuard`; permission/tenant guard or request policy adapter; exports required from `AuthModule`; `AppModule` organization import; HTTP/OpenAPI tests.
- **Allowed paths:**
  - `/home/server/projects/estateflow/apps/api/src/features/organizations/http/**`
  - `/home/server/projects/estateflow/apps/api/src/features/organizations/organization.module.ts`
  - `/home/server/projects/estateflow/apps/api/src/features/organizations/organization.tokens.ts`
  - `/home/server/projects/estateflow/apps/api/src/features/auth/auth.module.ts`
  - `/home/server/projects/estateflow/apps/api/src/app.module.ts`
  - `/home/server/projects/estateflow/apps/api/test/organization.http.test.mjs`
  - `/home/server/projects/estateflow/apps/api/test/openapi.test.mjs`
  - `/home/server/projects/estateflow/docs/handoffs/EF-121-II/worker-report.md`
- **Forbidden paths:** all other product paths; Prisma schema/migrations, dependency manifests/lockfiles, `.env*`, browser cookie/CSRF/origin/session implementation, shared/live DB targets, and Git metadata.
- **Acceptance:** exactly the six routes above; thin controllers; EF-120 guard ordering unchanged; all routes require verified sessions; generic cross-tenant denial; PlatformAdmin approval boundary; OpenAPI contract updated; HTTP RED/GREEN tests prove 401/403/404/no-side-effect cases.
- **Report path:** `/home/server/projects/estateflow/docs/handoffs/EF-121-II/worker-report.md`

### EF-121-III — Isolated integration, runtime smoke, and cleanup verification

- **Depends on:** EF-121-II independent verification PASS, then exact G3 `execute EF-121-III`.
- **Target symbols:** organization PostgreSQL integration tests, cleanup allowlist extension if required by the existing harness, and runtime-smoke test/harness evidence.
- **Allowed paths:**
  - `/home/server/projects/estateflow/apps/api/test/organization.repository.integration.mjs`
  - `/home/server/projects/estateflow/apps/api/test/organization.http.integration.test.mjs`
  - `/home/server/projects/estateflow/apps/api/test/support/cleanup-database.mjs`
  - `/home/server/projects/estateflow/docs/handoffs/EF-121-III/worker-report.md`
- **Forbidden paths:** all product source, schema/migrations, dependency manifests/lockfiles, `.env*`, shared/live DB targets, external services, and Git metadata.
- **Acceptance:** isolated PostgreSQL-only migration/integration evidence; synthetic runtime smoke covers the five flows in Section 4; explicit FK-safe cleanup proves empty target; full required regression commands have recorded output; no source repair without a new approved delta packet.
- **Report path:** `/home/server/projects/estateflow/docs/handoffs/EF-121-III/worker-report.md`

Every slice is one writer, one bounded packet, one report, and one independent verification before the next human gate. No packet authorizes its successor, a repair, commit, push, deployment, dependency/environment change, or shared/live database mutation.

## 6. Plan verification

The packet-required commands were run after writing this file:

```text
git diff --check -- docs/handoffs/EF-121-PLAN/implementation-plan.md
# exit 0; no output

test -s docs/handoffs/EF-121-PLAN/implementation-plan.md
# exit 0

git status --short -- docs/handoffs/EF-121-PLAN/implementation-plan.md
# ?? docs/handoffs/EF-121-PLAN/implementation-plan.md
```

## Readiness verdict and first executable packet boundary

**PASS** — EF-121 is planned only; no product source was modified. The first executable boundary is **EF-121-I**, limited to the persistence/domain/use-case paths enumerated above. It may be issued only after Mamdouh gives G2 approval of this plan and then the separate exact G3 authorization: `execute EF-121-I`.
