# EF-501 — Viewing availability and conflict prevention

## Verdict

**PASS within the EF-501 packet boundary.** The feature adds organization-scoped broker weekly availability, local-date blocked/extra exceptions, audited viewing lifecycle commands, UTC interval persistence, Lead timeline links, and a PostgreSQL `tstzrange` exclusion constraint for confirmed intervals. No worker, reminder, geo-search, dependency, environment, commit, push, deployment, or shared database change was made.

## Delivered

- `BrokerAvailabilityRule` stores weekday/minute windows and an IANA timezone; `BrokerAvailabilityException` stores blocked/extra local-date windows.
- Owner/Manager manage availability; active Brokers can manage their own viewing lifecycle, while a Broker cannot act for another Broker. Client and inactive/foreign memberships are denied or tenant-safe 404.
- Viewing lifecycle is `REQUESTED -> CONFIRMED -> (RESCHEDULED | CANCELLED | COMPLETED | NO_SHOW)`. Reschedule changes the UTC interval atomically and records a `RESCHEDULED` audit transition. Only `CONFIRMED` rows are excluded from overlap.
- Migration `20260929100000_ef501_viewings` enables `btree_gist` and adds `EXCLUDE USING gist (brokerId WITH =, tstzrange(startAt,endAt,'[)') WITH &&) WHERE status = 'CONFIRMED'`.
- Repository catches the PostgreSQL exclusion failure and raises the feature-owned `ViewingConflictError`; HTTP maps it to a 409 response with `VIEWING_CONFLICT` payload data, without exposing database/SQL text.
- Every viewing transition is recorded in `ViewingTransition` and linked to the Lead append-only timeline as `VIEWING_*`.
- Arabic responsive `/ar/organizations/:organizationId/viewings` provides a weekly list, UTC request form, and lifecycle actions.
- OpenAPI and the generated client publish the EF-501 operations. The supervisor-owned `apps/api/test/openapi.test.mjs` was not edited; the new routes are listed below.

## New routes

- `GET/POST /organizations/{organizationId}/viewings`
- `GET /organizations/{organizationId}/viewings/{viewingId}`
- `POST /organizations/{organizationId}/viewings/{viewingId}/{confirm|reschedule|cancel|complete|no-show}`
- `GET /organizations/{organizationId}/brokers/{brokerId}/availability`
- `POST /organizations/{organizationId}/brokers/{brokerId}/availability/{weekly|exceptions}`

## Tests and evidence

- Unit: `apps/api/test/ef501-viewings.application.test.mjs` — illegal transitions, authority, tenant-safe lookup, broker scope.
- PostgreSQL integration: `apps/api/test/ef501-viewings.repository.integration.test.mjs` — exactly one winner in two concurrent confirmations, typed conflict loser, exclusion count, Lead timeline link, tenant-safe lookup, and America/New_York DST fallback interval.
- Integration database: `estateflow_test` on `127.0.0.1:55435`, with `ALLOW_DESTRUCTIVE_TESTS=1` and the packet `DATABASE_URL`.

## Deferred to EF-502 / EF-510

Reminder scheduling and outcome automation remain EF-502. Geo search, radius/polygon filters, clustering, and performance evidence remain EF-510. No external reminders or worker changes were introduced.
