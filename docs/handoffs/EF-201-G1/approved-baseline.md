# EF-201 G1 — Approved Conservative Baseline

**Status: APPROVED**
**Decision:** Mamdouh approved the conservative EF-201 baseline on 2026-08-01.

## Product boundary

- Organization-owned Property and Listing records.
- One active Listing per Property; preserve listing history for future work.
- Property states: `ACTIVE`, `ARCHIVED`.
- Listing states: `DRAFT`, `PUBLISHED`, `ARCHIVED`.
- No destructive deletion in EF-201.
- Explicit create, update, publish, and archive commands.

## Authorization and visibility

- Owner and Manager may create, update, publish, and archive organization properties/listings.
- Broker may read published organization listings only; no management commands.
- Client has no property/listing management capability.
- PlatformAdmin gains no implicit tenant data access.
- `PUBLISHED` means organization/demo visibility only, never public marketplace exposure.

## Data, search, and media

- Bounded searchable textual address only; no latitude/longitude, map, radius, polygon, or clustering in EF-201.
- Optimistic concurrency uses a version field for mutable property/listing lifecycle commands.
- Image metadata/upload abstraction uses a replaceable test adapter; no external storage provider.
- Accepted image types: JPEG, PNG, WebP. Maximum size: 5 MiB. Maximum images per listing: 10.

## Delivery and verification

- Backend/API and isolated PostgreSQL integration first.
- Arabic-first responsive web UI is a later, separate bounded packet after API contract verification.
- Isolated PostgreSQL verification is authorized only through the established destructive-test guard; no shared/live database.
- No commit, push, deploy, provider integration, or public exposure is authorized.
