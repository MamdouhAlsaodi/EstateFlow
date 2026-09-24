# EF-601 — Media pipeline implementation

**Task:** `ESTATEFLOW-EF601-MEDIA-PIPELINE-001`
**Provider/model:** `zai/glm-5.3-flash`
**Verdict:** **PASS**

## Delivered

- **StoragePort abstraction** (`apps/api/src/features/media/domain/storage.port.ts`) mirroring the EF-404 `PublishingChannelPort` / EF-305 `NotificationProviderPort` pattern: `issueUploadIntent` (presigned-grant seat), `putDirect` (the storage service's own direct-upload entry — never the confirm path), `readObject`, `deleteObjects`, `adapterId`. The only activated adapter is the deterministic `InMemoryFakeStorageAdapter` (same inputs → same keys/tokens/bytes, no credentials). An `S3CompatibleStorageAdapterNotActivated` class documents the exact same port for S3 and refuses every byte-path operation ("not activated: no credentials configured"); it is never wired in the module. The full port contract is documented in the module header.
- **Signed upload intents** (`domain/media-intent.ts`): HMAC-SHA256 tokens (injected secret; process-random by default, fixed key in tests) binding mediaId + organization + property + uploader + kind + content-type + max-bytes + expiry. Typed rejections: `INTENT_INVALID_SIGNATURE`, `INTENT_EXPIRED`, `INTENT_BINDING_MISMATCH` (wrong user/org/property/content-type/size). The client uploads directly to the storage boundary in the real world; the API never receives file bytes in any business command.
- **Confirm-time validation** (`domain/media.ts`): magic-byte container sniffing (JPEG/PNG/WEBP/MP4/WEBM/MOV — header + structure, not client headers), declared-content-type↔actual-container match (`MAGIC_MISMATCH`), per-kind size limits (images 5 MiB aligning with EF-201, videos 100 MiB) plus the per-intent bound size (`OVERSIZE`), polyglot marker scan for images (`%PDF-`, `<script`, `<?php`, `GIF8`, ZIP, MIDI → `POLYGLOT_SUSPECTED`), intrinsic image dimension parsing (PNG IHDR, JPEG SOF walk, WEBP VP8/VP8L/VP8X) with a 16–10000 px sanity window (`DIMENSION_INVALID`), empty-payload and unknown-format rejection. Intent-time filename policy rejects double extensions (`shell.php.png` → `FILENAME_DOUBLE_EXTENSION`), mismatched extensions, and unsafe names before any byte is stored.
- **Deterministic image variants at confirm**: THUMB (160 px) and PREVIEW (640 px) with aspect-preserving, never-upscaling, half-up geometry derivation; variant records persisted (`MediaVariant`) with their own opaque storage keys; the fake adapter persists a verbatim copy under each variant key (real adapters re-encode behind the same port). Same input always yields the same variants.
- **Video placeholder**: confirm validates MP4/WEBM/MOV metadata and transitions the asset to `PROCESSING` with `processingNote = "VIDEO_TRANSCODE_OUT_OF_SCOPE"` and no variants. Async transcode remains out of scope per plan.
- **Orphan cleanup policy**: intent TTL (15 min default) anchors the mark phase — PENDING assets past their intent expiry are marked `ORPHAN`; the sweep deletes storage objects (original + variants) then rows, and structurally never touches `CONFIRMED`/`PROCESSING` media (status-gated queries; confirmed bytes survive sweeps in integration proof). The sweep is a callable API-side service (`MediaApplication.runOrphanMaintenance`) and the EF-601 half of the ONE worker tick (`media-orphan-tick.ts` composed in `apps/worker`), with the in-memory-fake cross-process boundary documented.
- **Schema/migration**: `MediaKind`/`MediaStatus`/`MediaFormat`/`MediaVariantKind` enums; `MediaAsset` + `MediaVariant` with composite `(organizationId, id)` uniques, opaque unique storage keys, status/orphan indexes; `Property.coverMediaId` composite-FK cover link (migration `20261002000000_ef601_media_pipeline`, applied to `estateflow_test` only).
- **HTTP boundary** (`http/media.controller.ts`, `http/media-storage.controller.ts`, `http/media.dto.ts`), guarded per established patterns (canonical origin + session + CSRF on unsafe business routes; session on reads; the storage-simulation PUT is token-authorized exactly like a presigned grant and excluded from the business API). New routes (none in the closed-world OpenAPI document; both controllers are `@ApiExcludeController`, `apps/api/test/openapi.test.mjs` untouched):
  - `POST /organizations/:organizationId/properties/:propertyId/media/upload-intents`
  - `PUT  /organizations/:organizationId/properties/:propertyId/media/storage-objects/:storageKey` (storage-sim, token-authorized)
  - `POST /organizations/:organizationId/properties/:propertyId/media/:mediaId/confirm`
  - `GET  /organizations/:organizationId/properties/:propertyId/media`
  - `GET  /organizations/:organizationId/properties/:propertyId/media/:mediaId/bytes` (demo display path for the in-memory fake)
  - `POST /organizations/:organizationId/properties/:propertyId/media/:mediaId/cover`
  - `DELETE /organizations/:organizationId/properties/:propertyId/media/:mediaId`
- **No filesystem paths / no storage keys in responses**: intent responses expose only the opaque `et1_…` token key (required to perform the direct upload); asset/list responses expose closed-world fields (ids, kind/status/format/dimensions/variants) — asserted by tests. Typed error codes surface as HTTP messages: 400 `MediaValidationError`/`UploadIntentError` codes, 409 `MediaStateError` codes, 404 tenant-safe, 403 authority.
- **Authority matrix**: OWNER/MANAGER/BROKER (ACTIVE) create intents, confirm, set cover, delete; every active member including CLIENT may read lists/bytes; unverified and non-members are denied everywhere; confirm is uploader-bound (a Broker cannot confirm an Owner's intent — `INTENT_BINDING_MISMATCH`).
- **Web (Arabic-first, RTL, mobile-responsive)**: new property detail page `/ar/organizations/:organizationId/properties/:propertyId` with property summary and the media workspace: file picker → signed intent → direct upload (raw PUT to the storage simulation) → confirm → grid with deterministic thumb rendering, cover badge, set-cover, delete, per-status Arabic labels, and a visible upload-step rail. `apps/web/src/test/ef601-media-contract.test.ts` proves closed-world normalization (no storage keys/filesystem paths propagate) and Arabic label coverage.

## New files

- `apps/api/src/features/media/**` (domain, application, infrastructure, http, module)
- `apps/api/prisma/migrations/20261002000000_ef601_media_pipeline/`
- `apps/api/test/ef601-media.domain.test.mjs`, `ef601-media.application.test.mjs`, `ef601-media.http.test.mjs`, `ef601-media.repository.integration.test.mjs`, `support/ef601-media-fixtures.mjs`
- `apps/web/src/features/properties/*`, `apps/web/src/app/ar/organizations/[organizationId]/properties/[propertyId]/page.tsx`, `apps/web/src/test/ef601-media-contract.test.ts`
- Modified: `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`, `apps/worker/src/index.ts` (orphan-sweep half of the composed tick)

## Tests and evidence

- Unit: 17 domain tests (sniffing, dimensions, polyglot, sizes, filename policy, variant determinism, intent sign/verify/expiry/tamper/keying, opaque keys, fake determinism, S3-not-activated refusals), 10 application tests (happy path, video placeholder, binding matrix, tenant isolation, authority matrix, malicious confirmations, cover/delete, TTL mark+sweep never deleting confirmed media), 5 HTTP tests (route/guard metadata, strict DTOs, typed error→status mapping, storage-sim grant flow).
- Integration on `estateflow_test` (`ESTATEFLOW_TEST_DB_PORT=55435`, loopback, `ALLOW_DESTRUCTIVE_TESTS=1`): 5 tests — full lifecycle with persisted variant rows, malicious suite leaving zero confirmed rows, binding/tenant/authority matrix, orphan TTL sweep keeping confirmed+processing media, FK-safe cleanup leaving tables empty.

## Fresh gate evidence

- `pnpm lint` — **PASS** (workspace + infrastructure checks included).
- `pnpm typecheck` — **PASS**.
- `pnpm test` — **PASS**: API unit suite 59 files; Web 85 tests; worker, api-client, design-tokens, config all green.
- `ESTATEFLOW_TEST_DB_PORT=55435 DATABASE_URL=postgresql://estateflow_test:test_only_change_me@127.0.0.1:55435/estateflow_test ALLOW_DESTRUCTIVE_TESTS=1 pnpm test:integration` — **PASS**: API integration suite 31 files; worker integration suites (composed runtime now including the media orphan tick) PASS.
- `API_ORIGIN=http://127.0.0.1:3000 pnpm build` — **PASS**, including the new Arabic property-detail route.
- `pnpm check:openapi-drift` — **PASS** (document unchanged; media controllers excluded).
- `git diff --check` — **PASS**.
- Prettier touched-file check — **PASS** after final formatting.

## Boundary compliance

No real storage credentials or external storage calls; the S3-compatible port stays deactivated and unwired. No `openapi.test.mjs` edits (new routes listed above). No video transcode. No commit/push/deploy/shared DB/dependency/`.env`/AGENTS/`apps/web/src/app/en` changes. One documented, packet-pre-approved deviation used: `apps/worker` wiring for the orphan sweep (optional per packet, composed as the third half of the single worker tick).
