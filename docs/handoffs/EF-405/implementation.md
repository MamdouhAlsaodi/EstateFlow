# EF-405 — Marketing analytics

## Verdict

**PASS within the packet boundary.** EF-405 is read-only: no migration, mutable
analytics state, worker change, dependency change, environment-file change,
commit, push, deployment, or shared/live database access was introduced.

## Delivered

- `PrismaCampaignRepository` adds bounded organization-scoped rollups over
  existing `Campaign`, approved `Expense`, `LeadTouch`,
  `LeadAttributionCorrection`, `Lead`, `PaymentRecord`/receivable/deal, and
  published `ContentItem` rows.
- Campaign analytics report planned budget, approved spend, touch count,
  first/last-touch attributed lead counts, qualified leads, wins, attributed
  revenue, published content counts by channel, and derived CPL/CAC/ROI.
- Organization analytics reports the corresponding aggregate totals. All
  analytics responses carry a server-generated `asOf` freshness timestamp.
- First/last attribution uses the EF-401 deterministic touch order and latest
  append-only correction; a correction that clears attribution remains cleared.
  Approved expense spend is the only spend truth. Published content counts use
  `ContentItem.status = PUBLISHED` and the real campaign composite tenant key.
- CPL/CAC/ROI use exact minor-unit integer inputs and return the literal
  `not enough data` when a denominator is absent (including missing spend or
  revenue for ROI).
- Owner and Manager reads are guarded by the existing browser session and
  membership authority. Broker, Client, inactive, unverified, and foreign
  tenant access are denied; foreign campaign ids resolve to tenant-safe 404s.
- Arabic campaign list/detail views now show a responsive organization/campaign
  analytics panel with budget progress, attribution counts, published channel
  counts, and freshness.
- OpenAPI and the generated client publish the two new GET operations. The
  supervisor-owned `apps/api/test/openapi.test.mjs` was not edited; its frozen
  inventory therefore reports the two expected EF-405 paths as legacy drift.

## New public routes

- `GET /organizations/{organizationId}/campaigns/analytics` — organization
  summary, Owner/Manager.
- `GET /organizations/{organizationId}/campaigns/{campaignId}/analytics` —
  campaign rollup, Owner/Manager, tenant-safe 404.

## Tests and evidence

- API unit: `ef405-campaign-analytics.application.test.mjs` — authority,
  freshness, zero-denominator behavior, and tenant-safe 404.
- API PostgreSQL integration:
  `ef405-campaign-analytics.repository.integration.test.mjs` — exact seeded
  reconciliation for planned budget, approved-only spend, touches,
  first/last-touch attribution, published channel counts, and tenant isolation.
- Web unit: `ef405-campaign-analytics.test.ts` — freshness and strict closed
  response normalizers.
- Integration command passed on the isolated stack:
  `ESTATEFLOW_TEST_DB_PORT=55435 DATABASE_URL=postgresql://estateflow_test:test_only_change_me@127.0.0.1:55435/estateflow_test ALLOW_DESTRUCTIVE_TESTS=1 pnpm --dir apps/api run test:integration`
  — 27 files, EF-405 passed; pre-existing port-55433 tests skipped as designed.

## Gates

- `pnpm lint` — PASS.
- `pnpm typecheck` — PASS.
- `pnpm --dir apps/web test` — PASS, 79/79.
- EF-405 API unit tests — PASS, 2/2.
- `pnpm test:integration` with the packet database variables — PASS.
- `API_ORIGIN=http://127.0.0.1:3000 pnpm build` — PASS.
- `pnpm check:openapi-drift` — PASS.
- Touched-file Prettier check — PASS.
- `git diff --check` — PASS (freshly verified after final documentation edits).
- Full `pnpm test` remains blocked by the explicitly forbidden edit to
  `apps/api/test/openapi.test.mjs`; its only failure is the frozen path list
  missing the two routes listed above. All other unit and web tests pass.
