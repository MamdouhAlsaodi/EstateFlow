# EF-404 — Publishing adapters recovery

## Boundary and verdict

EF-404 is implemented within the R2 packet boundary. Publishing uses an explicit `PublishingChannelPort` with only a deterministic in-memory recording adapter. There are no external portal calls, provider SDKs, credentials, or secret configuration.

The existing `AutomationScheduler.runTick` remains the API-owned scheduler path. `apps/worker` keeps one polling loop and composes the existing automation tick with the content delivery half in the same batch/cadence; no independent long-lived publishing loop or scheduler was introduced.

## Implementation

- `apps/api/src/features/content/domain/publishing.ts` defines the deterministic occurrence key over organization, content item, approved version, channel, and scheduled occurrence; bounded attempts/backoff; typed retry/terminal failure; cancellation; share-ready UTM bundle; exact delivered payload snapshot; and pre-attempt approval/hash/channel/schedule re-verification.
- `PublishingChannelPort` and `InMemoryRecordingPublishingAdapter` are the only adapter boundary/implementation. The fake records deterministic receipts in memory and performs no network or credential access.
- `ContentApplication` derives and persists the publish occurrence in the same transaction as `APPROVED → SCHEDULED`. A duplicate occurrence returns a typed `duplicate-occurrence` result.
- PostgreSQL persistence uses tenant composite foreign keys, unique occurrence/delivery indexes, `FOR UPDATE SKIP LOCKED` claims, append-only delivery snapshots, terminal job guards, and atomic settle transactions. Cancel-before-delivery records `SCHEDULE_MISSED` plus the caller reason; delivered payloads include exact approved copy, UTM link, hash, and EF-403 provenance.
- The API exposes upcoming-delivery and publish-results views plus guarded cancellation. Results retain typed failure kinds and bounded reasons.
- Arabic web now has a mobile-responsive publishing workspace with two tabs: upcoming deliveries (including cancel-before-delivery) and publish results with Arabic typed failure labels. Strict closed-world client normalizers reject contract drift.
- The worker-path proof creates a scheduled occurrence through the application, delivers through the composed worker scheduler, closes the runtime, starts a fresh runtime, and proves replay produces no second delivery/transition.

## Public routes (not added to `apps/api/test/openapi.test.mjs`)

- `GET /organizations/{organizationId}/content/publishing/scheduled`
- `GET /organizations/{organizationId}/content/publishing/results`
- `POST /organizations/{organizationId}/content/{contentItemId}/publishing/cancel`

The frozen supervisor-owned OpenAPI path inventory therefore reports these three expected new paths as legacy drift. `pnpm check:openapi-drift` remains the authoritative generated-document check and does not require editing the forbidden inventory test.

## Tests and evidence

- EF-404 domain tests: PASS (11 tests).
- EF-404 application tests: PASS (7 tests).
- EF-404 PostgreSQL repository integration: PASS on `estateflow_test` loopback:55435, including replay/restart, cancel-before-delivery, failure/retry, tenant isolation, snapshot audit, terminal immutability, and typed reasons.
- EF-404 composed worker-path integration: PASS on `estateflow_test`; fresh runtime replay claims/delivers zero additional occurrences.
- Web tests: PASS (77 tests), including strict publishing normalizers.
- API and worker TypeScript builds: PASS.
- Worker unit tests: PASS (4 tests).
- `git diff --check`: PASS.

## Deferred / unchanged

- Real channel APIs, OAuth, credential vaults, rate limits against external services, and external publishing remain outside this packet.
- The frozen `apps/api/test/openapi.test.mjs` inventory remains supervisor-owned and was not edited.
- No commit, push, deployment, dependency, environment-file, shared-database, or credential change occurred.

**Verdict: PASS within the packet boundary.**
