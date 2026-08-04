# EF-201 T2 Quality Report

## Status

**PARTIAL**

## Fresh verification evidence

- Exact packet command: `source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm lint && node --test apps/api/test/ef201-property.application.test.mjs apps/api/test/ef201-property.images.test.mjs`
- Result: PASS; lint, workspace, and infrastructure checks passed; 9 tests passed, 0 failed, 0 skipped.
- The quality gate made no source or test changes. Only this report is written.

## Findings

### 1. Broker property reads are not restricted to published listings

`PropertyApplication.getProperty` permits a Broker when `activeListing` exists, without checking that its status is `PUBLISHED`. A draft listing can therefore make the property readable by a Broker, contrary to the T2 role matrix and published-only contract. The named test verifies published listing reads and listing denial, but does not cover broker property reads for draft listings.

### 2. Search cursor semantics are not implemented

`PropertyApplication.searchProperties` accepts `cursor` but always returns `nextCursor: null` and does not apply or validate cursor progression. The bounded limit check is present, and Broker result filtering is present, but the declared bounded cursor/limit contract is incomplete.

### 3. Search field restriction is not enforced at the application boundary

The application forwards the entire `search` string to the repository and does not define or enforce title/address-only matching. The contract and test do not demonstrate that other fields are excluded from search criteria.

## Verified contract areas

- Verified actor and active-membership checks are present.
- Owner/Manager management access, Client denial, and no implicit PlatformAdmin tenant access are covered by the named tests.
- Organization mismatch is mapped to non-disclosing not-found behavior in the reviewed application methods.
- Version checks, lifecycle delegation, and image metadata validation/count precondition are present and exercised.
- Image registration stores metadata only; the named test asserts no URL is persisted.

## Scope

Review was limited to the packet-declared property domain/application and application/image test paths. No forbidden path was edited or inspected for this gate.

## Decision

Do not accept T2 as PASS. Address the Broker draft-property visibility gap and complete/explicitly define cursor and title/address search semantics, then add focused tests and rerun the packet verification command.
