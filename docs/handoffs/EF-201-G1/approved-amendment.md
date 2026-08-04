# EF-201 G1 Amendment — Executable Contract

**Status: APPROVED**
**Decision:** Mamdouh approved this amendment on 2026-08-01.

## Test discovery and runtime

- EF-201 tests must use the existing discoverable API test roots: `apps/api/test/*.test.mjs` and `apps/api/test/*.integration.mjs`.
- Every executor/reviewer command must first activate the documented Node 24 runtime with `source ~/.nvm/nvm.sh`.
- Targeted isolated integration evidence must explicitly run the destructive-test database guard, the approved test migration step, API build, and direct Node test invocation for the named EF-201 integration file. Passing a path as an undocumented argument to the root recursive integration script is prohibited.

## Minimal property/listing contract

- `Property` uses only: tenant/identifier metadata, `title`, `propertyType`, bounded `addressText`, optional `ownerReference`, lifecycle `status`, optimistic `version`, and timestamps.
- `Listing` uses only: tenant/property identifiers, lifecycle `status`, optimistic `version`, and timestamps.
- `ownerReference` is optional operational text only; it is not a User relationship, contact record, or personal contact data.
- No coordinates, financial fields, additional PII, or unapproved property facts are in EF-201.

## API contract

- Organization-scoped authenticated API provides create/update Property, publish/archive Listing, organization-scoped list/detail queries, and image metadata operations only.
- Query contract: cursor pagination with `limit` constrained to 1–50; bounded textual search across `title` and `addressText`.
- The implementation plan must name exact paths/DTOs/responses/error handling before G2.
- Images remain provider-independent metadata plus a replaceable test adapter. There is no binary upload HTTP endpoint and no external object storage/provider in EF-201.

## Audit boundary

- Property/listing/image feature audit events are explicitly deferred from EF-201.
- The existing security audit model is not repurposed for these domain events.

All prior EF-201 G1 baseline decisions remain in force. No implementation, migration, commit, push, deploy, shared/live database action, or public exposure is authorized by this amendment.
