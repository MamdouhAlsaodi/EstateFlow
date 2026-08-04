# EF-201 T1 Quality Report

## Status

**PARTIAL**

## Fresh verification evidence

- Runtime: `node v24.14.1`; `pnpm 10.33.2`.
- `pnpm --dir apps/api run build` — PASS.
- Direct named T1 tests — PASS: 8 passed, 0 failed.
- `git diff --check` — PASS.

## Findings

### 1. One-active-listing invariant is not enforced (blocking T1 acceptance)

The approved R2 contract requires one active listing per property while retaining archived history. The implementation does not enforce this precisely:

- `apps/api/src/features/properties/domain/property.ts:106-109` creates a `DRAFT` from only a property and has no existing-listing input/check. It can therefore create unlimited drafts for the same property.
- `apps/api/prisma/migrations/20260803000000_ef201_property_listing/migration.sql:38` enforces uniqueness only for `PUBLISHED` rows. It permits multiple `DRAFT` rows and also permits a `PUBLISHED` row plus additional `DRAFT` rows.
- The test at `apps/api/test/ef201-property.domain.test.mjs:37-48` creates only one draft and never asserts rejection of a second draft or creation of a draft while another listing is published.

DRAFT and PUBLISHED transitions themselves are otherwise precise: only DRAFT can publish, publishing increments version, and ARCHIVED listings are retained. However, those transitions do not close the missing creation invariant.

### 2. TDD evidence is present but incomplete for the declared invariant

The executor report records the expected RED run and the fresh GREEN run is reproduced above. The direct tests cover basic lifecycle, versioning, allowlists, organization non-disclosure, image limits, and field lists, but do not provide a failing/passing assertion for the required one-active-listing rule or migration constraint. Repository tests are contract-field assertions only; no database migration execution is authorized in T1, so persistence enforcement remains unproven.

### 3. Changed-path scope is not clean in the working tree

The packet-allowed EF-201 paths are present, but fresh `git status --short` also reports changes/untracked content outside the allowed scope, including `docs/CURRENT_HANDOFF.md`, `docs/YUI_TECHNICAL_CONTEXT.md`, `.hermes/`, and numerous other `docs/handoffs/*` paths. These were not inspected or modified by this quality gate; they must be separated or explicitly attributed before scope can be accepted.

## Schema/migration agreement

The Prisma schema and migration agree on the declared Property, Listing, and ImageMetadata fields, enums, UUID/timestamp types, organization-scoped composite relation, version defaults, and image checks. The migration adds the required positive-version and image validation checks. The partial uniqueness implementation is the specific persistence-contract gap described above.

## Decision

Do not accept T1 as PASS. Correct the domain/application/repository creation contract and database-safe uniqueness for the complete active-listing invariant, add direct tests for DRAFT-vs-PUBLISHED cases, then rerun the named verification commands with a clean allowed-path diff.
