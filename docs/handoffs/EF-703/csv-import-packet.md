# EF-703 — reviewed CSV property import with dry-run/report (bounded slice)

Base `41e36d9` (`main`). Owner pre-authorized synthetic data only; EF-701/EF-702 acceptance, a Pilot, a named decision owner, and any real data remain out of scope. This slice is **not** EF-703 completion.

## Goal

New API feature `apps/api/src/features/properties/…/csv-import` (inside the properties feature or a sibling folder following the codebase's vertical-slice style) exposing, per organization:

- `POST /organizations/:organizationId/properties/csv-import/dry-run` — parse a small CSV of property rows (header exactly `title,propertyType,addressText,ownerReference,latitude,longitude`; UTF-8; max 100 rows; max total 512 KiB), validate every row with the existing `createProperty` domain rules **without writing anything**, and return a bounded JSON report: total rows, `valid` count, `errors` array (row number 1-based data row, bounded field code — never echo cell contents, coordinates, or ownerReference values), plus a per-row parsed preview ONLY for valid rows (title + propertyType + masked ownerReference presence flag).
- `POST /organizations/:organizationId/properties/csv-import/commit` — accepts the CSV plus a `dryRunToken` (opaque, single-use, bound to organizationId + exact bytes hash + 10-minute expiry, HMAC-signed like existing intent grants); re-validates everything server-side; inserts valid rows in one Prisma transaction; rolls back on any DB error; returns counts (imported, skippedDuplicate) and never echoes cell values. Duplicate `addressText+title` within organization → row skipped and counted, not an error. Enforce `OWNER`/`MANAGER` write roles via the existing PropertyApplication guard helpers; import is denied otherwise with the standard typed errors. No PII in logs anywhere.

CSV parsing: hand-rolled bounded RFC-4180 parser in domain code (no new dependencies). Reject quoted-newline trickery explicitly as a row error. Commit must require the report to have zero errors (validRows === total).

## Testing (TDD RED→GREEN, no skips)

- Unit (node:test, no DB): parser edge cases (CRLF, quoted commas, BOM reject, oversized row count, oversized bytes, header mismatch, invalid coordinates, overlong text) — RED first.
- Application unit: role guard (CLIENT/BROKER denied, unverified denied), token binding (wrong org/bytes/expiry rejected single-use), report shape boundedness (no cell content leakage), duplicate-skip counting, atomicity (repository fake throws mid-batch → nothing persisted).
- HTTP+PostgreSQL integration (guarded, skip locally; must run in CI): dry-run leaves table count unchanged; commit inserts rows; replay of the same token → 409; wrong org → 403/404-typed; cleanup as in existing suites.

## Non-goals

No lead/contact import, no update-or-upsert, no file storage, no background worker, no UI, no export, no new dependencies, no schema migration (Property table already fits; do not alter Prisma schema). If a required capability cannot be implemented safely, stop and report contract analysis instead of hacking.

## Verification

bash tests above; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm exec prettier --check` on touched files, `pnpm security:check` on staged files, `node --test` for new suites; CI must run the guarded integration suite and the full unit suite on exact head before merge. Independent read-only review by a second agent required; do not claim EF-703 acceptance, Pilot readiness, or security signoff.

## Documented limitations

The dry-run token single-use registry is process-local (in-memory), and the token HMAC secret is per-process. This mirrors the existing EF-601 media-intent convention; multi-replica deployments would need a shared store for revocation/one-time-use and a shared signing secret, which is out of scope for this slice.
