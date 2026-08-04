# EF-201 T1 Security Evidence Report

**Status: PARTIAL**

## Scope

Read-only review of the declared EF-201 persistence/domain paths for tenant ownership, validation, secrets/PII, public exposure, audit behavior, and destructive effects. No source or tests were changed.

## Findings

### 1. Organization ownership is enforced by the Listing foreign keys — PASS

`Listing` has both:

- `organizationId -> Organization.id`
- composite `(organizationId, propertyId) -> Property(organizationId, id)`

Therefore a Listing cannot reference a Property belonging to another organization, even if an application input pairs a foreign `propertyId` with the caller's organization ID. `Property` and `Listing` both use `ON DELETE RESTRICT`, preventing implicit cross-tenant deletion through these relations.

### 2. Application authorization boundary remains external — RISK / REQUIRED CONTROL

`PropertyApplication.update()` accepts `organizationId` as input and passes it to the repository. The reviewed paths contain no authentication, membership, capability, or request-context check. The repository contract also requires organization-scoped lookups/updates, but no implementation is present in the declared scope to prove that every read and mutation applies that scope atomically.

The composite database FK protects Listing-to-Property integrity, but it does not establish that the authenticated principal is a member of the supplied organization. Callers must derive organization scope from verified authorization context, not trust a client-provided organization ID. Repository updates should retain organization ID and expected version in the same conditional mutation.

### 3. Database invariants cover key resource bounds — PASS

The migration adds database checks for positive Property/Listing versions, image byte size from 1 through 5 MiB, and non-negative image positions. Domain validation restricts image media types to JPEG/PNG/WEBP and property text fields to bounded values. A partial unique index allows at most one `PUBLISHED` Listing per Property.

### 4. Missing database invariant for image-count limit — RISK

The domain exposes a maximum of 10 images and a `countImages()` repository operation, but the migration has no database constraint or transactional uniqueness strategy enforcing that limit. Concurrent requests can both observe a count below 10 and insert, exceeding the declared limit. Enforce the limit in a transaction/serialized operation or add an approved database-backed allocation mechanism.

### 5. Potentially sensitive property data needs explicit access control — RISK / BASELINE CONFIRMATION

`addressText` and optional `ownerReference` are persisted. No credentials, binary data, image URL, provider secret, or audit-event repurposing was added in the reviewed paths. However, these fields can contain personal or sensitive data, and this scope provides no public exposure or field-level authorization control. Confirm they are approved EF-201 data and ensure all read paths are organization-authorized and non-public by default.

### 6. No destructive or public behavior observed — PASS

The reviewed changes are schema/domain/repository contracts only. Relations use restrictive deletes; there are no endpoints, publication routes, external providers, secrets, logging changes, or audit writes in scope.

## Verification evidence

- `pnpm --dir apps/api run build` — passed.
- `git diff --check -- apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260803000000_ef201_property_listing apps/api/src/features/properties` — passed.

## Release recommendation

Do not treat this persistence/domain slice as a complete tenant-isolation assurance until the authorization context and repository implementation are reviewed, and the 10-image limit is made concurrency-safe. Confirm the approval/classification of `addressText` and `ownerReference` before exposing property data.
