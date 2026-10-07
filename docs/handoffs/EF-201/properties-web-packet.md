# EF-201-WEB — Properties list/create web slice packet

Base `86bc321` (`main`). Bounded web slice closing the biggest web-API gap: there is NO `properties/page.tsx` list route today (only `[propertyId]` detail and `import`). Arabic-first RTL, synthetic data, TDD RED→GREEN, no new dependencies, no API/OpenAPI changes, no commit/push from executor.

## Goal

1. `apps/web/src/app/ar/organizations/[organizationId]/properties/page.tsx` — server page (sibling pattern: `await params`, no fallback org) rendering a new `PropertiesListView` client feature: list properties via the generated client's `PropertyController_list` (org-scoped, existing pagination contract), Arabic labels from the catalog, each row links to the existing `[propertyId]` detail page, and a visible link/button to the existing `properties/import` page (closing the orphaned-import gap).
2. Create-property flow: minimal Arabic form (title, propertyType, addressText, ownerReference optional, latitude/longitude optional pair) posting via `PropertyController_create` with CSRF through the session provider (same pattern as csv-import-workspace.tsx), typed error surfacing (403 denial / 400 validation → Arabic messages, no raw payload echo). Location pair must be both-or-neither client-side, matching domain rule.
3. Wire the shell: replace the two placeholder nav entries' dead anchors for properties (`/ar#properties`) with the real route pattern used by sibling nav entries if the shell supports per-org links; if the shell cannot express org-scoped links without a larger refactor, add a visible entry point from within org pages instead and note the limitation — do NOT refactor the shell in this slice.

## Non-goals

No listing publish/archive/images UI (separate slice), no edit flow, no delete, no search/filter UI beyond what list query already supports, no shell rewrite, no API changes, no OpenAPI/codegen changes (controller already excluded; use the existing generated client methods as-is).

## Testing (TDD, tsx --test style in apps/web/src/test)

RED first: `ef201-properties-web.test.ts` covering — list view renders normalized property rows with Arabic labels and links; empty state Arabic copy; create form posts exact DTO shape via apiClient with CSRF; both-or-neither coordinate guard; 403/400 typed error mapping without payload echo; import-page link present; page file follows sibling server-page pattern (source-contract assertions allowed per repo convention).

## Verification

`cd apps/web && npx tsx --test src/test/ef201-properties-web.test.ts` green + existing i18n suites still green; `npx tsc --noEmit` in apps/web; eslint --max-warnings=0 on touched files; prettier --check; staged offline `security:check`. Catalog keys complete in ar+en (properties messages file). Independent read-only review before handback; CI on exact head before merge.
