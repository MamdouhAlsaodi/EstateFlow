# EF-402 — Content workflow (Phase 4)

## Boundary and verdict

EF-402 is **PASS within the packet boundary**. The content item aggregate with
the idea → draft → review → approved → scheduled → published/failed lifecycle,
the approval-locked version/content-hash pair, database-enforced published
immutability, revision variants that re-enter the full lifecycle, the review
queue and calendar data queries, the full authority matrix, and the
Arabic-first content workspace (list with lifecycle badges, review queue,
month-grid calendar, item detail with version timeline) are implemented and
verified. Scheduling records only a timestamp and a channel placeholder —
actual channel delivery stays in EF-404. `apps/worker`,
`apps/web/src/app/en`, and `apps/api/test/openapi.test.mjs` were not touched;
no commit/push/deploy, no dependency changes, no `.env` changes, and no shared
database was used.

## Implementation

### Database (migration twenty: `20260926100000_ef402_content_workflow`)

- `ContentItem` — org-scoped (`@@unique([organizationId, id])` composite
  tenant key): title (`VarChar 200`), body (`VarChar 5000`), `ContentChannel`
  (INSTAGRAM/X/SNAPCHAT/TIKTOK/LINKEDIN/FACEBOOK/WHATSAPP/EMAIL/WEBSITE/OTHER
  — a publishing-target placeholder, never a delivery integration),
  `ContentStatus` (IDEA/DRAFT/REVIEW/APPROVED/SCHEDULED/PUBLISHED/FAILED),
  optional `campaignId` (composite tenant FK to the EF-401 campaign),
  revision lineage (`rootContentId`, `variantOfId` — both composite tenant
  self-FKs — plus `variantNumber`), `scheduledFor`, and the approval lock
  pair `approvedVersion` + `contentHash` (`char(64)` sha256).
- `ContentTransition` — append-only audited lifecycle record (fromStatus →
  toStatus, optional reason, typed `ContentFailureKind`, `version` +
  `contentHash` set only by approvals, actor, timestamp). CHECK constraints
  enforce "FAILED always carries a typed failure kind AND a reason" and
  "version/hash appear exactly on APPROVED transitions".
- Partial unique index `(organizationId, rootContentId, variantNumber) WHERE
  rootContentId IS NOT NULL` makes duplicate variant numbers impossible even
  under concurrent revision creation.
- Database-enforced invariants (trigger `ef402_content_item_immutable`,
  same philosophy as the EF-305/EF-401 guard migrations):
  - **Published rows are fully immutable** — every UPDATE is rejected.
  - Identity/provenance columns (organizationId, campaignId, rootContentId,
    variantOfId, variantNumber, createdBy, createdAt) never change.
  - title/body/channel are editable only while the row is IDEA or DRAFT; any
    later change attempt is rejected ("create a revision").
  - `scheduledFor` can only change on the APPROVED → SCHEDULED transition.
  - `approvedVersion`/`contentHash` can only change on REVIEW → APPROVED and
    must increment by exactly one (`COALESCE(previous, 0) + 1`) with a
    non-null hash — version/hash bookkeeping cannot be forged.
  - The allowed status matrix is enforced in the database itself: IDEA→DRAFT,
    DRAFT→REVIEW, REVIEW→DRAFT, REVIEW→APPROVED, APPROVED→SCHEDULED,
    SCHEDULED→PUBLISHED, SCHEDULED→FAILED, FAILED→REVIEW. Everything else —
    including every transition out of PUBLISHED — raises an exception.
  - DELETE is allowed only for IDEA/DRAFT rows (demo cleanup); locked and
    published rows can never be deleted.
- `ef402_content_transition_append_only` rejects any UPDATE or DELETE of
  transition records.

### API — new `content` feature (`apps/api/src/features/content`)

- `domain/content.ts` — `createContentItem` (bounded text/UUID/channel
  validation), `editContentItem` (full replacement of title/body/channel/
  campaign link; rejected outside IDEA/DRAFT), `transitionContentItem` (the
  allowed matrix above; approval locks `approvedVersion =
  (previous ?? 0) + 1` and `contentHash = sha256(itemId + canonical payload)`;
  scheduling requires a strictly future UTC timestamp; failing requires a
  `ContentFailureKind` AND an explicit reason; every accepted transition
  returns the append-only audit record), `createContentRevision` (only from
  locked items APPROVED/SCHEDULED/PUBLISHED/FAILED; builds a NEW DRAFT
  variant with `variantNumber = lineage max + 1` under the same root;
  cross-tenant sources refused), `contentHashOf` (deterministic canonical
  hash over the exact reviewed payload so EF-404 can re-verify that nothing
  changed since approval).
- `application/content-application.ts` — authority matrix (ACTIVE membership
  required): OWNER/MANAGER perform approve/schedule/publish/fail transitions;
  OWNER/MANAGER/BROKER create items, edit unlocked content, submit for
  review, return drafts, spawn revisions, and read all views (list, detail,
  review queue, calendar); CLIENT is denied everything; unverified actors are
  denied. Tenant-safe typed `not-found` for foreign content/campaign ids,
  conflict results for lost guarded transitions, locked-content edits, and
  unlocked-source revisions, bounded cursor pagination with a strict
  base64url cursor codec, and a bounded calendar window (≤ 62 days per
  query).
- `infrastructure/prisma-content.repository.ts` — guarded transitions and
  edits run as conditional `UPDATE … WHERE status = fromStatus` writes (the
  database trigger re-validates every column rule); revisions run in a
  transaction that locks the source row `FOR UPDATE`, recomputes the lineage
  max, and inserts the new variant (the partial unique index backstops
  concurrent races); review queue = REVIEW items ordered oldest-submission
  first; calendar = items with `scheduledFor` inside the requested window
  (SCHEDULED, PUBLISHED, and FAILED keep their scheduled timestamps); the
  lineage query uses `COALESCE(rootContentId, id)` so roots and variants
  share one indexed path.
- HTTP (`http/content.dto.ts`, `http/content.openapi.ts`,
  `http/content.controller.ts`) follows the EF-401 guarded boundary: canonical
  origin + browser session + CSRF on every mutation, browser-session guard on
  reads, strict whitelist DTOs (unknown fields rejected, UTC timestamps
  enforced), result-kind mapping (403/404/409), domain errors → 400, and a
  UTC/bigint-safe response renderer.

### Web (Arabic-first, mobile-responsive)

- `features/content/content-contract.ts` — strict closed-world normalizers
  (unknown fields, non-enum statuses/channels/failure kinds, malformed
  UUID/UTC/hash values rejected before rendering).
- `features/content/content-labels.ts` — Arabic labels for lifecycle states,
  channels, typed failure kinds, plus a one-line state hint for the detail
  view.
- `features/content/content-api.ts` — feature adapter: reads are plain GETs;
  every mutation posts through the session CSRF provider with strict
  client-side prevalidation.
- `features/content/content-list-view.tsx` — content list with lifecycle
  badges per state, status filter, scheduled-for/approved-version summary,
  variant tags, and an inline idea-creation form (with optional campaign
  link).
- `features/content/content-review-queue-view.tsx` — the review queue:
  REVIEW items only, oldest submission first, linking straight into each
  item.
- `features/content/content-calendar-view.tsx` — month-grid publishing
  calendar (UTC, Monday-first): each day lists its scheduled/published/failed
  items color-coded by status with time and channel, linking to the detail
  view.
- `features/content/content-detail-view.tsx` — lifecycle badge and state
  hint, content body with locked hash display, guarded lifecycle actions per
  state (edit/submit for review/approve/schedule with a datetime
  input/publish/fail with typed kind + mandatory reason/re-enter review),
  revision-creation control, the **version timeline** (approval rows with
  version + full hash + UTC time), the append-only transition history, and
  the revision-variant lineage.
- New routes under `app/ar/organizations/[organizationId]/content`:
  the list page, `review-queue`, `calendar`, and `[contentId]` detail;
  single-column layout below 640px via the existing token/media-query
  patterns.

## Verification evidence

- `pnpm lint` — PASS (eslint + workspace + infrastructure checks).
- `pnpm typecheck` — PASS (api, client, web).
- API unit suite — every file passes except the supervisor-owned
  `apps/api/test/openapi.test.mjs`, whose only failure is the frozen path
  inventory missing exactly the seven new content paths listed below (same
  expected legacy failure recorded for EF-305/EF-306/EF-401); all other unit
  files were re-run explicitly and pass. New EF-402 unit coverage: domain
  9/9 (illegal transitions, hash change on content change, version
  increment, future-schedule rule, typed failure rule, edit lock, revision
  lineage), application 4/4 (authority matrix, tenant-safe 404s, revision
  flow, conflicts/validation).
- API client tests — 26/26 PASS; web tests — 71/71 PASS (new
  `content-contract.test.ts`: normalizer strictness for list/detail/queue/
  calendar and Arabic label coverage).
- `pnpm test:integration` (estateflow_test on 127.0.0.1:55435,
  `ALLOW_DESTRUCTIVE_TESTS=1`) — **PASS: 23 files**, including:
  - `ef402-content.repository.integration.test.mjs` — approval locks v1 +
    persisted sha256; locked-content edit conflict and raw-SQL UPDATE
    rejection; forged version/hash rejection; illegal status pair rejection
    at the database level; **published immutability** (raw UPDATE and DELETE
    both rejected); append-only transition records (UPDATE and DELETE
    rejected); FAILED with typed reason persisted and the missing-reason
    insert rejected by CHECK; FAILED→REVIEW→APPROVED locks v2; revision
    variant numbering [1, 2] with an untouched source; review-queue oldest-
    first ordering; calendar window filtering; full tenant isolation
    (foreign org sees nothing; cross-tenant campaign link violates the
    composite tenant FK); IDEA-row deletion allowed for cleanup; empty-table
    cleanup proof.
  - `ef402-content.http.integration.test.mjs` — transport guards (401/403/
    wrong-origin 403), strict DTO (unknown field 400), authority matrix over
    HTTP (broker creates/edits/submits, cannot approve/schedule/publish/
    fail; client denied reads), full lifecycle create→draft→review→approve
    (v1 + hash in payload)→schedule (future timestamp enforced)→publish,
    locked-content edit 409, missing-scheduledFor 400, missing failure kind
    /reason 400, revision 201 with variantNumber 2, IDEA-item revision 409,
    detail with version/hash timeline, review-queue and calendar endpoints,
    calendar window validation, and tenant-safe 404s/empty lists.
- `pnpm build` (with `API_ORIGIN=http://127.0.0.1:3000`) — PASS (api, client,
  web production builds).
- `pnpm check:openapi-drift` — PASS.
- `git diff --check` — PASS; `prettier --check` — PASS on all touched files.

### OpenAPI/client

`pnpm generate:openapi` regenerated `packages/api-client/openapi.json` with
the eight new content operations. `scripts/openapi-client-template.mjs` was
NOT extended with a content contract (the generated typed client gains no
Content methods; unknown families are ignored by the generator, so the drift
check passes). `apps/api/test/openapi.test.mjs` was not edited; its frozen
pre-EF-402 path inventory therefore fails on exactly the seven new paths
listed below (same expected legacy failure pattern as EF-305/EF-306/EF-401).
Both follow-ups (generator contract + inventory update) are supervisor-owned.

### New public routes (for the supervisor's `openapi.test.mjs` inventory)

- `POST /organizations/{organizationId}/content` (201)
- `GET  /organizations/{organizationId}/content` (200)
- `GET  /organizations/{organizationId}/content/review-queue` (200)
- `GET  /organizations/{organizationId}/content/calendar` (200; requires
  `from` + `to` UTC instants, ≤ 62-day window)
- `GET  /organizations/{organizationId}/content/{contentItemId}` (200)
- `POST /organizations/{organizationId}/content/{contentItemId}/edit` (200)
- `POST /organizations/{organizationId}/content/{contentItemId}/transition`
  (200; SCHEDULED requires future `scheduledFor`, FAILED requires
  `failureKind` + `reason`)
- `POST /organizations/{organizationId}/content/{contentItemId}/revisions`
  (201)

## Pre-approved and disclosed deviations

- `apps/api/prisma/schema.prisma` was edited to add the Content models/enums
  and Organization/Campaign back-relations (pre-approved by the packet; the
  Prisma client generates from it).
- New test files `apps/api/test/ef402-*.test.mjs` (pre-approved by the
  packet, EF-401 precedent).
- `apps/api/src/app.module.ts` received the one-line `ContentModule`
  registration (import + imports array). The packet's allowed paths did not
  list the app module, but without it no EF-402 route can exist through the
  existing OpenAPI generation — the same wiring every prior feature module
  required. No other change was made to that file.

## Explicitly out of scope (unchanged)

- Actual channel delivery, share-ready bundles, credential handling, and
  provider confirmation/retry are **EF-404**. The `channel` column and the
  scheduled timestamp are placeholders for that task; nothing is ever sent
  anywhere by EF-402.
- Listing-to-content draft generation is EF-403; marketing analytics is
  EF-405.
- No deployment, live-service mutation, commit, push, or real customer data.
