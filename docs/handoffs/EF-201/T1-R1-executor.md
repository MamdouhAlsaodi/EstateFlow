# EF-201 T1-R1 Backend Executor Report

## Status

**PASS** — G2 and G3 were explicitly present in the input packet for `EstateFlow/EF-201-T1-R1`:

- G2: Mamdouh accepted the strict active-listing invariant for EF-201.
- G3: Mamdouh approved the T1-R1 repair within the reviewed T1 scope.

The T1 quality and security reports and the approved R2 active-listing decision were read before editing.

## Changed files

- `apps/api/prisma/migrations/20260803000000_ef201_property_listing/migration.sql`
- `apps/api/src/features/properties/domain/property.ts`
- `apps/api/src/features/properties/application/property-repository.ts`
- `apps/api/test/ef201-property.domain.test.mjs`

No schema, HTTP, UI, module, auth, organization, settings, package, or independent review artifact was changed. No database connection or migration execution was performed.

## RED evidence

The approved domain assertions were added before the repair, then the named build/test command was run:

```text
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run build && node --test apps/api/test/ef201-property.domain.test.mjs apps/api/test/ef201-property.application.test.mjs apps/api/test/ef201-property.images.test.mjs apps/api/test/ef201-property.repository.unit.test.mjs
```

Literal relevant output:

```text
✖ listing lifecycle preserves history and allows one active draft before publish
AssertionError [ERR_ASSERTION]: Missing expected exception.
ℹ tests 8
ℹ pass 7
ℹ fail 1
```

This demonstrated the missing rejection for a second active listing before implementation.

## Repair implemented

- `createDraftListing` now accepts existing listings and rejects when any same-property listing is `DRAFT` or `PUBLISHED`; archived listings remain allowed.
- The migration index now enforces at most one `DRAFT` or `PUBLISHED` listing per property:

```sql
CREATE UNIQUE INDEX "Listing_one_active_per_property_idx" ON "Listing"("propertyId") WHERE "status" IN ('DRAFT', 'PUBLISHED');
```

- The repository port now exposes `findActiveListingForProperty(...)` instead of a published-only lookup, expressing the same active-listing boundary without adding persistence implementation.
- The lifecycle test asserts second DRAFT rejection, DRAFT alongside PUBLISHED rejection, and new DRAFT allowance after ARCHIVED.

## GREEN evidence

```text
source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run build && node --test apps/api/test/ef201-property.domain.test.mjs apps/api/test/ef201-property.application.test.mjs apps/api/test/ef201-property.images.test.mjs apps/api/test/ef201-property.repository.unit.test.mjs
```

Literal relevant output:

```text
ℹ tests 8
ℹ pass 8
ℹ fail 0
```

## Verification commands and results

Runtime command:

```text
node --version
v24.14.1
pnpm --version
10.33.2
```

- `pnpm --dir apps/api run build` — PASS.
- Named T1 domain/application/image/repository tests — PASS, 8 passed, 0 failed.
- `pnpm test` — PASS, 126 tests, 125 passed, 0 failed, 1 skipped.
- `pnpm typecheck` — PASS.
- `git diff --check` — PASS.

All commands used the required Node/pnpm precondition. No migration, database, Docker, destructive, commit, push, deploy, or publication command was run.

## Risks and limitations

- The partial unique index was not applied or exercised against PostgreSQL because migration execution and database access are forbidden in this packet.
- The repository port is contract-only; Prisma persistence implementation and conflict handling remain for a later approved packet.
- Existing unrelated worktree content outside the packet scope was not modified or attributed by this executor.

## Next human decision

Accept or reject this bounded T1-R1 repair after independent quality/security review. If accepted, Mamdouh must explicitly approve the next packet (including any persistence implementation); no migration deployment, commit, release, or publication is authorized by this report.
