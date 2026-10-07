# EF-703 — Arabic-first CSV property-import UI (bounded slice)

Base `bba4e77` (`main`). Continues the merged API slice (#37). Owner authorized synthetic data only; still no EF-703 acceptance, no decision owner, no Pilot, no real data.

## Goal

Add the Arabic-first web UI for the already-merged CSV import API:

- `apps/web/src/features/properties/csv-import-workspace.tsx` — client component wired like the finance/property workspaces (CSRF via `createSessionCsrfProvider`, calls through `createApiClient` convention or the existing fetch helpers in `media-api.ts` style). Flow: textarea/paste CSV (bounded client-side to the same 512 KiB / 100-row limits), dry-run button → show the report (totalRows/validRows/errors with Arabic field labels; previews only for valid rows), then commit button using the returned token → show imported/skippedDuplicate counts. Token/CSV mismatch, replay, and denials surface as typed Arabic messages without leaking cell contents. No cell content echoed in error states beyond what the API previews already return.
- `apps/web/src/app/ar/organizations/[organizationId]/properties/import/page.tsx` — server page (Arabic-first, RTL) rendering the workspace with the org context the same way sibling pages do.
- Catalog: add ar/en keys under `properties` messages (`csvImport*` set) in `apps/web/src/i18n/messages/properties.ts`; keep the missing-key check green (both locales complete).
- Keep the closed-world conventions: no OpenAPI/client-codegen changes required (the API controller is deliberately excluded); the UI calls the two documented routes directly.

## Non-goals

No file-picker upload, no drag/drop, no CSV editing, no export, no leads import, no dashboard. Error copy never shows raw cell values, coordinates, or ownerReference data.

## Testing (TDD RED→GREEN)

- `apps/web/src/test/ef703-csv-import-ui.test.ts` — pure component/contract tests following `apps/web/src/test/*.test.ts` conventions (tsx --test): Arabic labels complete for report fields, error mapping (403 denial, 409 token problems) renders the right Arabic message without echoing cell data, bounded textarea guard rejects oversized input client-side, valid-row previews render exactly what the API returns.
- No new dependencies; reuse existing test helpers/style.

## Verification

`pnpm --dir apps/web test` style suite green locally; `pnpm lint`, `pnpm typecheck`, focused `prettier --check` on touched files; `pnpm security:check` on staged files. i18n missing-key check must stay green. CI on exact head required before merge; independent read-only review by a second agent. Not EF-703 completion: remaining EF-703 scope (decision owner, pilot dashboard, reviewed import process) stays open.

## Implementation notes (feat/ef703-csv-import-ui)

- `features/properties/csv-import-workspace.tsx` — client component following the commission-workspace pattern (`createApiClient` + `createSessionCsrfProvider`, `apiClient.request` with `csrfToken`, no raw `fetch`). Exports pure, test-imported helpers: `MAX_CSV_BYTES` (512 KiB), `MAX_CSV_ROWS` (100), `csvInputError` (client-side bound guard returning a catalog key), `describeCsvImportError` (403 → forbidden, 401 → session, 409 → token conflict, else generic — statuses only, response bodies are never echoed). Flow: paste CSV → dry-run → report (totalRows/validRows; errors as row number + localized field label via `labelFromKey`; previews rendered verbatim from the API) → commit with the returned `dryRunToken` → imported/skippedDuplicate/totalRows summary.
- `app/ar/organizations/[organizationId]/properties/import/page.tsx` — server page awaiting `params`, wrapping the workspace in `OrganizationProvider` (same as sibling finance pages); no fallback org identity.
- `i18n/messages/properties.ts` — 35 new `properties.csvImport.*` keys, complete in ar and en; ar is source of truth. No cell content in any error string.
- Test file follows the repo's source-contract style plus direct imports of the pure helpers; TDD RED (module not found / route + copy assertions failing) observed before implementation, GREEN after.

### Verification (local, exact head)

- `COREPACK_ENABLE_NETWORK=0 corepack pnpm install --offline --frozen-lockfile` — OK (pnpm 10.33.2)
- `npx tsx --test src/test/ef703-csv-import-ui.test.ts` — 7/7 pass
- `npx tsx --test src/test/i18n-hardcoded.test.ts src/test/i18n.test.ts` — 10/10 pass (catalog complete)
- `npx tsc --noEmit` (apps/web) — clean
- `npx eslint <touched files> --max-warnings=0` — clean
- `npx prettier --check <touched files>` — clean
- `pnpm security:check` on staged files — see final session run
