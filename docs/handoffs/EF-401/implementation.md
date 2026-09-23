# EF-401 — Campaigns and attribution (closes FIN-06, opens Phase 4)

## Boundary and verdict

EF-401 is **PASS within the packet boundary**. The campaign aggregate,
append-only attribution, authorized corrections, manual performance entry, the
real expense–campaign binding, the campaign dimension in owner reporting, and
the Arabic campaign views are implemented and verified. No external
ad-platform integration exists anywhere (manual entry only). `apps/worker`,
`apps/web/src/app/en`, and `apps/api/test/openapi.test.mjs` were not touched;
no commit/push/deploy, no dependency changes, no `.env` changes.

## Implementation

### Database (migration seventeen: `20260925100000_ef401_campaigns_attribution`)

- `Campaign` — org-scoped (`@@unique([organizationId, id])` composite tenant
  key): name, objective, `CampaignChannel` enum, `CampaignStatus`
  (DRAFT/ACTIVE/COMPLETED/CANCELLED), startsAt/endsAt, `budgetPlannedMinor`
  - currency, five UTM columns, created/updated bookkeeping.
- `CampaignTransition` — append-only audited lifecycle record
  (fromStatus → toStatus, actor, reason, timestamp).
- `CampaignBudgetCorrection` — append-only planned-budget adjustment
  (previousMinor → correctedMinor, currency, mandatory reason, actor).
- `CampaignPerformanceEntry` — append-only manual channel metrics
  (impressions/clicks/leadsCount, note). Money never enters here: campaign
  spend truth stays in Finance Core so totals always reconcile.
- `LeadTouch` — append-only attribution fact per lead: `TouchChannel`,
  source, five UTM columns, optional `campaignId` (composite tenant FK),
  occurredAt, actor.
- `LeadAttributionCorrection` — append-only attribution override
  (previousCampaignId → correctedCampaignId, mandatory reason, actor).
- `Expense.campaignId` — the EF-234 `campaignReference` (opaque text, kept for
  legacy display) graduates to a real composite tenant FK
  `("organizationId","campaignId") → Campaign("organizationId","id")` with an
  index. Nullable migration: existing rows keep their opaque reference text
  and receive `NULL` campaignId — no guessing.
- Database-enforced append-only invariants: `BEFORE UPDATE OR DELETE` triggers
  reject any mutation of `CampaignTransition`, `CampaignBudgetCorrection`,
  `CampaignPerformanceEntry`, `LeadTouch`, and `LeadAttributionCorrection`
  (same guard philosophy as the EF-305 immutability migration).
- `apps/api/prisma/schema.prisma` was updated to match the migration (the
  Prisma client models are generated from it; the packet listed only the
  migrations directory, but the schema is the source the client generates
  from — flagged here for the supervisor).

### API — new `campaigns` feature (`apps/api/src/features/campaigns`)

- `domain/campaign.ts` — `createCampaign` (bounded text/UUID/positive-money
  validation, endsAfterStarts, UTM tag validation), `transitionCampaign`
  (allowed matrix: DRAFT→ACTIVE/CANCELLED, ACTIVE→COMPLETED/CANCELLED only;
  cancellation requires a mandatory reason; returns the append-only audit
  record), `correctCampaignBudget` (append-only adjustment; mandatory reason;
  must change the value; rejected on cancelled campaigns),
  `createCampaignPerformanceEntry` (bounded non-negative integer metrics).
- `domain/attribution.ts` — `createLeadTouch`, `createAttributionCorrection`
  (must change the attributed campaign; mandatory reason),
  `deriveTouchAttribution` (first/last campaign-bound touch under the
  deterministic total order `(occurredAt, id)`, so ties never flip with
  insertion order), `applyAttributionOverride` (latest correction wins; a
  correction without a target campaign clears attribution),
  `latestCorrection`.
- `application/campaign-application.ts` — authority matrix (ACTIVE OWNER or
  MANAGER for every campaign read/command; BROKER/CLIENT denied), tenant-safe
  typed `not-found` for foreign campaign/lead ids, conflict mapping for lost
  guarded transitions/corrections, bounded cursor pagination with a
  self-contained base64url cursor codec (strict shape validation).
- `infrastructure/prisma-campaign.repository.ts` — guarded transitions and
  budget corrections run as transactions: an atomic `UPDATE … WHERE status =
fromStatus` (or `budgetPlannedMinor = previousMinor AND status <>
'CANCELLED'`) wins or loses the race before the append-only record is
  inserted; campaign list joins per-row lateral aggregates for actual spend
  (campaign-currency approved expenses) and touch counts; attribution reads
  are two single-row `DISTINCT`-style queries plus the correction log.
- `http/campaign.controller.ts` / `campaign.dto.ts` / `campaign.openapi.ts` —
  guarded routes (canonical origin + session + CSRF for mutations;
  `BrowserSessionGuard` for reads), strict class-validator DTOs
  (`forbidNonWhitelisted`), bigint/UTC-safe response rendering, tenant-safe
  404s, `403` access-denied, `409` state conflicts.

### API — finance integration

- Expense create accepts a new optional `campaignId`; the application resolves
  it through the composite tenant lookup (foreign campaign → tenant-safe
  `404 campaign`), the domain validates it as a UUID dimension, and the
  repository persists it. `campaignReference` remains an optional legacy text
  field with unchanged semantics for EF-234 compatibility.
- EF-235 reports:
  - The expense rows/payments-expenses report dimension now accepts
    `campaignId` (single-dimension rule enforced: deal XOR property XOR
    campaign), and expense report items expose `campaignId` when bound.
  - New owner-only read-only route
    `GET /organizations/{organizationId}/finance/reports/campaigns/performance?model=FIRST_TOUCH|LAST_TOUCH`:
    revenue per campaign from payments on deals whose lead attributes to the
    campaign (first or last campaign-bound touch, then the latest append-only
    correction), costs per campaign from approved expenses bound through the
    composite tenant FK, margin = revenue − costs, windowed by
    `recordedAt`/`decidedAt`. Campaign finance totals therefore reconcile to
    Finance Core by construction.
  - Fixed a latent SQL alias bug in the EF-235 deal/property performance cost
    queries (`windowRange('e."decidedAt"')` referenced an alias that the
    `FROM "Expense"` clause never declared; it only broke when a from/to
    window was supplied).

### OpenAPI/client

`pnpm generate:openapi` regenerated `packages/api-client/openapi.json` and
`src/generated.ts`. `scripts/openapi-client-template.mjs` gained the closed
campaign contract (exact request/response schemas, method overrides,
response-type rendering) plus the new report operation, the `campaignId` query
field on the expenses report, and `campaignId` in the expense-create body.
`apps/api/test/openapi.test.mjs` was not edited; its frozen pre-EF-401 path
inventory therefore fails on exactly the nine new paths (same expected legacy
failure recorded for EF-305/EF-306). The supervisor owns that update.

### New public routes (for the supervisor's `openapi.test.mjs` inventory)

- `POST /organizations/{organizationId}/campaigns` (201)
- `GET  /organizations/{organizationId}/campaigns` (200)
- `GET  /organizations/{organizationId}/campaigns/{campaignId}` (200)
- `POST /organizations/{organizationId}/campaigns/{campaignId}/transition` (200)
- `POST /organizations/{organizationId}/campaigns/{campaignId}/budget-corrections` (201)
- `POST /organizations/{organizationId}/campaigns/{campaignId}/performance-entries` (201)
- `GET  /organizations/{organizationId}/campaigns/{campaignId}/performance-entries` (200)
- `POST /organizations/{organizationId}/leads/{leadId}/touches` (201)
- `GET  /organizations/{organizationId}/leads/{leadId}/touches` (200)
- `GET  /organizations/{organizationId}/leads/{leadId}/attribution` (200)
- `POST /organizations/{organizationId}/leads/{leadId}/attribution-corrections` (201)
- `GET  /organizations/{organizationId}/finance/reports/campaigns/performance` (200; requires `model=FIRST_TOUCH|LAST_TOUCH`)

### Web (Arabic-first, mobile-responsive)

- `features/campaigns/campaign-contract.ts` — strict closed-world normalizers
  (unknown fields, non-enum statuses/channels, malformed money/UUID/UTC values
  rejected before rendering).
- `features/campaigns/campaign-labels.ts` — Arabic labels for campaign
  statuses, campaign channels, touch channels, and attribution models.
- `features/campaigns/campaign-api.ts` — feature adapter: reads are plain
  GETs; every mutation posts through the session CSRF provider with strict
  client-side prevalidation.
- `features/campaigns/campaigns-list-view.tsx` — campaign list with status
  chips, budget progress bars (planned vs approved-spend actual, over-budget
  indication), touch counts, and an inline create form.
- `features/campaigns/campaign-detail-view.tsx` + `budget-progress.tsx` —
  budget progress with per-currency approved-expense actuals, lifecycle
  timeline with guarded activate/complete/cancel actions (cancel requires a
  typed reason), append-only budget-correction history, manual performance
  entries table, and the attribution view (per-lead lookup showing first/last
  touch and the audited override, plus one-click attribution correction with
  mandatory reason).
- New routes `/ar/organizations/[organizationId]/campaigns` and
  `/ar/organizations/[organizationId]/campaigns/[campaignId]`; single-column
  layout below 640px via the existing token/media-query patterns.
- Finance reports dashboard (`features/finance/owner-finance-dashboard.tsx`)
  gained the campaign dimension: revenue/margin per campaign under both
  first-touch and last-touch models with per-campaign expense drill-down; the
  expenses report adapter/model accept and normalize `campaignId`.

## Verification evidence

- `pnpm lint` — PASS (eslint + workspace + infrastructure checks).
- `pnpm typecheck` — PASS (api, client, web).
- API unit suite — every file passes except the supervisor-owned
  `apps/api/test/openapi.test.mjs`, whose only failure is the frozen path
  inventory missing exactly the nine new campaign paths listed above; the
  files sorting after it (`organization.*`) were re-run explicitly and pass
  (12/12, 5/5; the two `.integration.mjs` helpers skip without the test-stack
  env, as designed). New EF-401 unit coverage: domain 8/8, application 6/6.
- API client tests — 26/26 PASS; worker unit tests — PASS.
- `pnpm test:integration` (estateflow_test on 127.0.0.1:55435,
  `ALLOW_DESTRUCTIVE_TESTS=1`) — **PASS: 21 files**, including:
  - `ef401-campaign.http.integration.test.mjs` — transport guards, authority
    matrix, strict DTO, lifecycle including forbidden transitions and
    reason-required cancellation, append-only budget corrections (rows cannot
    be UPDATEd or DELETEd), manual performance entries, expense→campaign FK
    binding with cross-tenant 404 and a raw cross-tenant insert rejection,
    budget actuals reconciling to the approved expense, tenant-scoped list.
  - `ef401-attribution.integration.test.mjs` — append-only touches (UPDATE/
    DELETE rejected at the DB), touch history ordering, first-touch vs
    last-touch divergence on a seeded sequence, organic touches never
    attributing, append-only attribution correction with previous-campaign
    audit and DB immutability, and campaign performance reconciliation
    (FIRST_TOUCH: A=100000/−8000 costs, B=0/12000; LAST_TOUCH: A=70000,
    B=30000 after the override; organic deal attributes nowhere; windowed
    query empties revenue while attribution stays anchored; owner-only;
    unknown model 400).
- Web tests — 67/67 PASS (5 new `campaign-contract.test.ts`).
- `pnpm build` (with `API_ORIGIN=http://127.0.0.1:3000`) — PASS, including the
  two new Arabic campaign routes in the production build.
- `pnpm check:openapi-drift` — PASS (tracked artifacts match generation).
- `git diff --check` — PASS.
- Prettier on every touched file — PASS (`.prisma`/`.sql` have no prettier
  parser, matching repo convention).

## Environment note

The isolated `estateflow_test` stack on this machine listens on
`127.0.0.1:55435`; all integration evidence used
`ESTATEFLOW_TEST_DB_PORT=55435 DATABASE_URL=postgresql://estateflow_test:test_only_change_me@127.0.0.1:55435/estateflow_test ALLOW_DESTRUCTIVE_TESTS=1`
with the destructive-test guard passing before any mutation.

## Explicitly deferred

- EF-405 marketing analytics (CPL/CAC/ROI, data-completeness warnings) — next
  task after EF-402 content workflow.
- Channel API publishing adapters (EF-404), CSV/PDF export (FIN-07).
- Lead/Broker finance dimensions (FIN-06 fully closes with EF-405/EF-701 per
  the development plan; the Campaign dimension itself is now real).
