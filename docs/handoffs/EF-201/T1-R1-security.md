# EF-201 T1-R1 Security Evidence Report

**Status: PASS**

## Scope

Read-only review of the declared T1-R1 paths, focused on the active-listing database constraint and tenant composite foreign-key integrity. No source changes were made.

## Evidence

- `apps/api/prisma/migrations/20260803000000_ef201_property_listing/migration.sql`
  - `Listing_organizationId_propertyId_fkey` references `Property(organizationId, id)` and uses `ON DELETE RESTRICT ON UPDATE CASCADE`, preventing a listing from referencing a property in another organization.
  - `Listing_one_active_per_property_idx` is a unique partial index on `propertyId` for `DRAFT` and `PUBLISHED` rows, enforcing at most one active listing per property at the database boundary.
  - `Listing_organizationId_fkey` separately enforces that the listing tenant exists.
- `apps/api/src/features/properties/application/property-application.ts`
  - Property updates require the supplied organization and property identifiers to match the loaded record; mismatches resolve as not found.
  - Version equality is checked before update delegation.
- `apps/api/src/features/properties/domain/property.ts`
  - Domain transitions reject listings for archived properties and reject duplicate active listings in the supplied existing-listing set.
  - Version checks protect update/publish/archive transitions against stale writes.
- Verification commands passed:
  - `pnpm --dir apps/api run build`
  - `git diff --check`

## Risks and deferred controls

- Authentication, request-level authorization, and enforcement inside a concrete repository/HTTP adapter were not present in the declared T1 paths and are not certified by this review. Verify them in the applicable T2/T3 security gate.
- The domain duplicate-listing check is advisory under concurrency; the database partial unique index is the authoritative race-safe control.
- Image metadata validation and per-listing image-count enforcement require transactional/concurrent-safe enforcement in the persistence adapter; classify and verify as a later control, not a T1 defect.

## Conclusion

The declared T1 database ownership boundary and active-listing uniqueness constraint are present and correctly scoped. No T1 security defect was identified.
