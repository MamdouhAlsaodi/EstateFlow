# EF-630 — Arabic/English i18n + RTL/LTR (implementation)

Packet: `ESTATEFLOW-EF630-I18N-RTL-001` · mode `execution` · provider `zai` · model `glm-5.3-flash` · dates 2026-08-28 (R1) + 2026-09-24 (R2)

## What was built

### 1. Single locale/direction switch (`apps/web/src/i18n/`)

- `config.ts` — `Locale` (`ar` | `en`), `DEFAULT_LOCALE = "ar"`, `directionFor(locale)` (the ONE direction switch: `ar` → `rtl`, everything else → `ltr`), `htmlAttributes(locale)`, `LOCALE_REQUEST_HEADER`.
- `middleware.ts` — derives the locale from the first URL segment and forwards it as `x-estateflow-locale`; the async root layout is the only renderer of `<html lang dir>` via `htmlAttributes(locale)`. Future `/en` pages light up English+LTR with zero feature-component changes. `app/en` pages remain explicitly deferred (packet boundary).
- `react.tsx` — client `LocaleProvider` + `useT()`/`useLocale()` hooks; `server.ts` — `getRequestLocale()`/`getServerT()` from the request header (never re-exported from the client barrel).
- `catalog.ts` — merged typed catalog: `en: Record<keyof typeof ar, string>` makes a missing English key a **typecheck/build failure**; `translate()` falls back ar → key with a dev-time error, never inventing text; `interpolate()` handles `{var}` substitution; `labelFromKey()` resolves typed-code label maps keeping unknown codes raw.

### 2. Locale-aware formatters (`apps/web/src/i18n/format.ts`)

`formatDate`/`formatDateTime`/`formatTime`/`formatNumber`/`formatMoney`/`formatSignedMoney`/`formatPercent`/`formatFileSize` — all Intl-based, `ar` default, locale-parameterized. Money converts exact minor-unit strings (bigint-safe contract) and **rejects fractional/malformed amounts instead of truncating**. All previously ad-hoc `new Intl.DateTimeFormat("ar", …)` call sites (leads workspace, admin ×4, automation ×4) now use the shared formatters. Digit rendering follows ICU `ar` on this runtime (Latin digits); units/symbols localize from the catalog.

### 3. Translation catalog (`apps/web/src/i18n/messages/`)

Twelve namespaces (`common`, `leads`, `finance`, `contracts`, `content`, `campaigns`, `automation`, `admin`, `viewings`, `properties`, `search`) — Arabic source of truth plus complete English counterpart. **Swept to catalog keys:** app shell, error/loading/not-found, metadata, admin landing, design-demo UI copy, leads (board/model/workspace/timeline), viewings (list/detail/statuses/reminders), search, properties (detail/media workspace/media contract labels + size units), admin (all five views + all label maps), automation (all five views + label maps + action-error model), campaigns (list/detail/budget/labels). Model-level label maps (`LEAD_STAGE_LABELS`, `AGING_*`, `MEDIA_*`, `MEMBERSHIP_*`, `AUDIT_*`, `FAILURE_*`, `job*Labels`, `campaign*Labels`) now carry `MessageKey` values, not rendered text.

### 4. Enforcement (the plan's "i18n missing-key check" + "no hardcoded strings")

- `src/test/i18n.test.ts` — runtime missing-key check (en keys ≡ ar keys, non-empty values, placeholder-variable parity across locales), direction-mapping proof, translator/fallback proof, formatter outputs (`pnpm typecheck` enforces the same at compile time and therefore in `next build`).
- `src/test/i18n-hardcoded.test.ts` — filesystem scan rejecting Arabic **string literals** in `features/` + `app/` outside `i18n/` (comments ignored). The explicit `ALLOWED_FILES` allowlist is the sanctioned exception set; each entry documents its reason and the list must shrink, never grow.

### 5. R2 — remaining sweep completed (17 files, allowlist emptied)

R2 mechanically migrated the last three feature surfaces to the catalog, same pattern as R1 (Arabic source of truth + typed English counterpart; views resolve through `t()`/`labelFromKey()`; label maps hold `MessageKey` values):

- **content** (7 files): `content-labels.ts` (status/channel/failure/hint/slot maps → `content.*` keys; `generationProvenanceLabel(t, …)` resolves through the catalog), list/detail/calendar/review-queue/publishing views, generation panel (`content.list|detail|actions|calendar|weekday|review|publishing|generation.*`).
- **contracts** (2 files): `contracts-contract.ts` (status/audit/role maps → `contracts.*` keys; `OPERATIONAL_ESIGN_DISCLAIMER_AR` is now **read from the catalog** (`contracts.esignDisclaimer`) so the rendered banner and the API protocol sentinel cannot drift), `contracts-workspace.tsx` (incl. default title/body template patterns read from `arMessages` as form-initial DATA, unchanged values).
- **finance** (8 files): `owner-report-model.ts` (owner bucket/commission status maps → keys; attribution models reuse the identical `campaigns.attribution.*` catalog text), owner dashboard, commission/receivable/expense command workspaces, receivable command contract + cancellation panel, expense command contract (`finance.*`). `receivableSuccessMessage`/`expenseSuccessMessage` now return `MessageKey`s resolved by the caller; `isSessionErrorMessage` matches the catalog wording instead of a hardcoded literal (same visible behavior).

The `i18n-hardcoded.test.ts` allowlist now contains **only** the permanent synthetic-demo-data exemption; the scan guards the entire `features/` + `app/` tree. Source-regex tests that pinned Arabic wording (`content-*`, `ef610-*`, `receivable-*`, `commission-*`, `expense-*`) were repaired to assert catalog keys in the source plus the exact `arMessages` wording. Zero behavior changes: all 264 pre-R2 Arabic literals were verified present in the catalog (2 intentionally shared with the existing campaigns keys).

## PDF Arabic (EF-610 writer) — verified, limitation documented

Fresh runtime verification of `apps/api/src/features/contracts/domain/minimal-pdf.ts`:

```text
header: %PDF-1.4
escape check (ع -> U+0639): true
arabic present as escapes: true
bytes: 1701
```

The writer is deterministic and zero-dependency by design (EF-610): core Helvetica with `/WinAnsiEncoding`, Arabic rendered as lossless `U+XXXX` escapes (every non-WinAnsi code point), hash-stable output. **Embedding a real Arabic font is not possible in this packet**: it requires (a) a binary TTF/OTF asset (a new dependency — forbidden here) and (b) Arabic glyph shaping + bidi reordering (contextual forms, ligatures, RTL runs) which a core-font content stream does not perform. No dependency was added; the `U+XXXX` encoding remains the lossless, verifiable operational record. API behavior unchanged (`openapi` drift check PASS).

## RTL/LTR audit

- The app's CSS (`globals.css` + design tokens) uses logical properties (`inset-inline-start`, `padding-inline`) with no physical `left/right`/`text-align: left|right` rules found in the sweep; RTL correctness is inherited, and the single `directionFor()` switch flips the document for any future locale.
- Bidirectional data (UUIDs, hashes, timestamps, coordinates, UTC inputs) is already wrapped in `dir="ltr"` spans/inputs in the original views; the sweep preserved every explicit `dir` marker.
- Known limitation (documented, not fixed): a small number of table rows display raw API timestamps; these are `dir="ltr"`-wrapped so they render correctly under RTL.

## Gates (all fresh, R2 session 2026-09-24)

| Gate                                              | Result                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm lint` (incl. workspace + infra checks)      | PASS                                                                                              |
| `pnpm typecheck`                                  | PASS (0 errors; en-catalog completeness enforced)                                                 |
| `pnpm test`                                       | PASS (web 108/108 incl. i18n + hardcoded-scan suites; API unit 65 files; worker 4; api-client 26) |
| `pnpm test:integration`                           | PASS except the **documented pre-existing EF-502 worker time-bomb** (see below)                    |
| `pnpm build` (`API_ORIGIN=http://127.0.0.1:3000`) | PASS (all routes dynamic, middleware registered)                                                  |
| `check:openapi-drift`                             | PASS (exit 0)                                                                                     |
| `git diff --check`                                | PASS                                                                                              |
| `prettier --check` touched files                  | PASS                                                                                              |

Integration detail: API integration suites all pass on `estateflow_test` loopback:55435 (EF-231…EF-620, 33 files). Worker integration: receivable-reminder and Lead-SLA suites PASS; `publishing-worker` suite PASS (run directly); the `ef502-viewing` suite failed with `ViewingValidationError: Viewing is outside broker availability` — the **documented pre-existing time-bomb** (run at ~21:50 UTC, inside the 21:00–24:00 UTC failure window; the seeded now+2h viewing crosses UTC midnight and the availability check requires same-local-day). It is outside this packet's allowed paths and is being fixed separately by the supervisor; no attempt was made to fix it.

## Boundaries respected

No `app/en` pages created; no `openapi.test.mjs` edits; no `apps/worker` source changes (integration runner invoked read-only); no API behavior changes; no new dependencies; no commit/push/deploy; no `.env` changes (test DB URL passed inline per the documented loopback:55435 override); no AGENTS edits.
