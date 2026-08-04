# EF-201 T1-R1 Quality Report

## Status: PARTIAL

### Fresh evidence

- `pnpm --dir apps/api run build` — PASS.
- `node --test apps/api/test/ef201-property.domain.test.mjs` — PASS: 3/3 tests.
- `git diff --check` — PASS.
- Scope review found changes limited to the packet’s declared EF-201 paths; no forbidden-path changes were observed.

### Verified

- `apps/api/src/features/properties/domain/property.ts` rejects creation of a second `DRAFT` or `PUBLISHED` listing when the existing listing set is supplied, and permits a new draft after archiving.
- `apps/api/prisma/migrations/20260803000000_ef201_property_listing/migration.sql` adds the database-enforced partial unique index `Listing_one_active_per_property_idx` for `DRAFT`/`PUBLISHED` listings.
- Direct domain tests cover draft duplication, published duplication, archive-then-recreate, and lifecycle behavior.

### Scope finding

- `apps/api/src/features/properties/application/property-repository.ts` declares `findActiveListingForProperty`, but its `createListing` port does not express an invariant/atomic create contract, and no repository adapter or port-level test is present in the declared T1-R1 scope. The direct tests exercise only the domain and do not verify the migration constraint or repository-port behavior.

The database constraint is the race-safe enforcement point, but the requested domain/port/direct-test coverage is incomplete. Add a port contract/adapter assertion and a direct migration or repository integration test before treating this gate as a full PASS.
