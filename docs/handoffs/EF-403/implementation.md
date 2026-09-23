# EF-403 — Safe listing-to-content generation (Phase 4)

## Boundary and verdict

EF-403 is **PASS within the packet boundary**. Listing-to-content generation is
live with the full safety model of the task: a closed allowlisted property
projection, one deterministic template per channel, visible placeholders for
every missing fact, a typed legal-claim denylist, a complete provenance stamp
(property id + property version + template id + template version) enforced by
the database, and generated drafts that enter the unchanged EF-402 workflow as
normal DRAFTs. **There are no LLM, provider, or network calls anywhere in the
generation path — generation is a pure function of (property version,
template version, channel).** `apps/worker`, `apps/web/src/app/en`, and
`apps/api/test/openapi.test.mjs` were not touched; no commit/push/deploy, no
dependency changes, no `.env` changes, and no shared database was used.

## Safety model (the point of the task)

1. **Allowlisted projection.** `projectPropertyForContent`
   (`apps/api/src/features/properties/domain/content-projection.ts`) copies
   exactly `title`, `propertyType`, `addressText` (+ `propertyId`,
   `version` for the stamp) and nothing else. `PROPERTY_CONTENT_ALLOWLIST` is
   explicit and closed. `ownerReference` (owner PII), `organizationId`,
   `status`, and timestamps are structurally unreachable: the projection type
   does not carry them and the Prisma reader (`prisma-property-projection.reader.ts`)
   does not SELECT them.
2. **Deterministic templates.** `GENERATION_TEMPLATES`
   (`apps/api/src/features/content/domain/generation-template.ts`) holds one
   versioned template per channel (all ten channels, `templateVersion` 1).
   `renderGenerationTemplate` is pure: identical inputs render byte-identical
   copy. Template variables come only from the allowlisted projection.
3. **Missing facts become visible placeholders.** The EF-403 projection has no
   price/area/rooms facts, so `[PRICE]`, `[AREA]`, `[BEDROOMS]`,
   `[BATHROOMS]` render as bracketed markers and are returned in the
   `placeholders` array. Nothing is invented, defaulted, rounded, or
   numeric-filled (tests assert no multi-digit numbers outside `[PRICE]`).
4. **Legal-claim denylist with typed rejection.** `assertNoLegalClaims` runs
   over the rendered title and body — including property-sourced values, so a
   guarantee claim hidden in a property title cannot reach a draft.
   Normalization (diacritics stripped, alef/ya/taa-marbuta unified, latin
   lowercased) closes trivial evasion. Violations throw
   `GenerationPolicyError` (`code: "GENERATION_POLICY_VIOLATION"`) listing the
   matched terms; HTTP maps it to 400.
5. **No bypass.** Generation inserts the item **with status DRAFT** together
   with the audited IDEA→DRAFT transition in one transaction. From there the
   item is ordinary EF-402 content: review → approval (Owner/Manager) locks
   the version + sha256 content hash; only the normal lifecycle can move it.
   CLIENT is denied everywhere; generation authority is
   Owner/Manager/Broker (the EF-402 authoring matrix).
6. **Provenance stamp.** `sourcePropertyId`, `sourcePropertyVersion`,
   `generatedTemplateId`, `generatedTemplateVersion` are set together at
   creation, never editable, and are shown in API responses and the Arabic UI.

## Implementation

### Database (migration twenty-one: `20260927100000_ef403_generation_provenance`)

- `ContentItem` gains four nullable provenance columns
  (`sourcePropertyId UUID`, `sourcePropertyVersion INTEGER`,
  `generatedTemplateId VARCHAR(100)`, `generatedTemplateVersion INTEGER`).
- CHECK `ContentItem_generation_provenance_complete`: the four columns are all
  NULL or all NOT NULL — a half-written stamp can never exist.
- CHECKs `ContentItem_source_property_version_positive` /
  `ContentItem_generated_template_version_positive`: versions are ≥ 1.
- Composite tenant FK `ContentItem_source_property_fkey`
  (`(sourcePropertyId, organizationId)` → `Property(id, organizationId)`): a
  cross-tenant stamp is impossible at the database level.
- The EF-402 trigger function `ef402_reject_content_item_update` is extended
  in place (CREATE OR REPLACE FUNCTION, same trigger binding): the provenance
  columns join the immutable identity set, so a stamp can never be rewritten.
- Index `ContentItem_organization_source_property_idx`.
- `schema.prisma` counterpart edits: the four columns, the
  `sourceProperty`/`sourceContentItems` relation pair, and the index.

### API — `content` and `properties` features

- `domain/generation-template.ts`: slot model (`PROPERTY_TITLE`,
  `PROPERTY_TYPE`, `ADDRESS` resolve from the projection; `PRICE`, `AREA`,
  `BEDROOMS`, `BATHROOMS` are missing-fact slots → placeholders), the ten
  templates, `renderGenerationTemplate`, `listGenerationTemplates`,
  `GenerationValidationError`, `GenerationPolicyError`,
  `legalClaimDenylist`, `normalizeForPolicyScan`, `assertNoLegalClaims`.
- `domain/content.ts`: `ContentItem`/`createContentItem` accept the optional
  provenance stamp (validated all-or-nothing, positive versions, template id
  ≤ 100 chars); `createContentRevision` inherits the stamp unchanged; manual
  items remain unstamped; `contentHashOf` is unchanged.
- `application/generation-application.ts`: `GenerationApplication` with the
  `PropertyProjectionReader` port (`found`/`archived`/`not-found`),
  membership authorization reusing the EF-402 authoring roles, deterministic
  render → item with stamp → domain IDEA→DRAFT transition → atomic
  `repository.createGeneratedDraft` (P2003 race → typed conflict).
- `application/content-repository.ts`: `createGeneratedDraft` port.
- `infrastructure/prisma-content.repository.ts`: provenance-aware row mapping
  and inserts, lineage SELECT extended, `createGeneratedDraft` transaction,
  revision insert carries the stamp.
- `infrastructure/prisma-property-projection.reader.ts`: allowlist-enforcing
  reader (SELECT names only the allowlisted columns + `status`; archived
  properties return `archived`, foreign ids return `not-found`).
- `http/content.controller.ts` + `content.dto.ts` + `content.openapi.ts`:
  - `POST /organizations/{organizationId}/content/generate` (Owner/Manager/
    Broker; canonical-origin + session + CSRF guards; strict DTO with
    `propertyId` UUID, `channel` enum, optional `templateVersion`; 400
    validation/policy, 403 authority, 404 tenant-safe, 409 conflicts) →
    `201 { item, placeholders, templateId, templateVersion }`.
  - `GET /organizations/{organizationId}/content/generation-templates`
    (same authority for reads) → `{ items: [...] }` with templateId, channel,
    templateVersion, title/body patterns, factSlots.
  - `contentItemSchema` extended with the four provenance properties.
  - Both routes are declared before the parametric
    `GET .../content/:contentItemId` route to avoid shadowing.

### OpenAPI / client

- `pnpm generate:openapi` regenerated `packages/api-client/openapi.json`
  (drift check passes against the committed document).
- `packages/api-client/src/generated.ts` is unchanged: the closed-world typed
  client inventory is supervisor-owned and the EF-402 web code already uses
  raw `apiClient.request` paths — the content feature follows the same
  pattern. No drift, no inventory change.

### Web (Arabic-first)

- `content-contract.ts`: closed-world normalizers
  `normalizeGenerationTemplates` / `normalizeGeneratedDraft` (unknown fields
  and malformed provenance rejected), provenance fields added to
  `ContentRecord`, `splitPlaceholderSegments` for highlighting.
- `content-api.ts`: `fetchGenerationTemplates`, `generateContentDraft`
  (CSRF-provider transport, strict id validation before any call).
- `content-generation-panel.tsx` (mounted on the Arabic content workspace):
  template list → property id + channel → **توليد مسودة** → resulting draft
  with every `[PRICE]`-style marker rendered as a highlighted `<mark>`, the
  missing-fact chips in Arabic, the provenance line
  (`مولّد من القالب … من إصدار العقار …`), and an explicit note that the draft
  is ordinary (مراجعة ← اعتماد، بلا أي تجاوز للدورة) with a review-queue link.
- `content-detail-view.tsx`: shows the generation stamp when present.
- `content-labels.ts` / `content-views.module.css`: Arabic slot labels and
  placeholder/provenance styles.

## New public routes (supervisor-owned `openapi.test.mjs` inventory)

Two paths, two operations:

1. `/organizations/{organizationId}/content/generate` —
   `ContentController_generate` (POST, 201/400/401/403/404/409).
2. `/organizations/{organizationId}/content/generation-templates` —
   `ContentController_generationTemplates` (GET, 200/401/403).

Per the packet, `apps/api/test/openapi.test.mjs` was NOT edited. The unit
suite therefore has exactly one known failure: the closed path-inventory
assertion in that file (same expected legacy pattern as EF-305/EF-306/EF-401/
EF-402). Every other unit and integration file passes.

## Tests

New files (all green):

- `apps/api/test/ef403-generation.domain.test.mjs` — 9 tests: closed
  allowlist projection (owner PII structurally absent), byte-level
  determinism, placeholder correctness across all ten templates, typed
  denylist rejection (Arabic stems, phrases, diacritics, English), tainted
  property values, catalog shape, unknown channel/version typed errors,
  provenance stamping + partial-stamp rejection, revision stamp inheritance.
- `apps/api/test/ef403-generation.application.test.mjs` — 7 tests: DRAFT +
  audited IDEA→DRAFT transition + full stamp, determinism across repeats,
  authority (broker/owner generate, CLIENT + unverified denied), tenant-safe
  not-found, archived conflict, policy rejection persists nothing, race →
  typed conflict, template list authority.
- `apps/api/test/ef403-generation.repository.integration.test.mjs`
  (`estateflow_test`) — provenance persisted, reader never fetches owner PII,
  all-or-nothing CHECK violation, stamp immutability under the extended
  trigger, composite-FK tenant proof, foreign tenant access-denied, review →
  approval + revision inheriting the stamp, lineage carries the stamp.
- `apps/api/test/ef403-generation.http.integration.test.mjs`
  (`estateflow_test`) — transport guards, strict DTO (unknown/prompt fields
  rejected), template list endpoint + CLIENT 403, broker generate 201 with
  provenance + placeholders, byte-identical regeneration (HTTP determinism),
  tainted property → 400, tenant-safe 404s, leakage probe asserting owner PII
  (`صالح`, `0555`, `ownerReference`) absent from every payload, and the full
  no-bypass lifecycle walk DRAFT→REVIEW→APPROVED→SCHEDULED→PUBLISHED with
  hash lock and intact stamp.
- `apps/web/src/test/content-generation.test.ts` — 4 tests: template +
  generated-draft normalizers (closed world), placeholder splitting, exact
  Arabic labels/provenance wording.

## Gate evidence

- `pnpm lint` — PASS (workspace + infrastructure checks included).
- `pnpm typecheck` — PASS (api, web, api-client).
- `pnpm test` (unit) — all files PASS except the expected single failure:
  `openapi.test.mjs` path inventory (two new paths listed above;
  supervisor-owned update). All `ef403-*` unit files and every other file
  pass, including `organization.*` files that sort after the failing file.
- `pnpm test:integration` (`estateflow_test`, port 55435,
  `ALLOW_DESTRUCTIVE_TESTS=1`) — API integration suite passed: 25 files
  (including the two new EF-403 integration files); worker + web suites pass.
- `pnpm build` (`API_ORIGIN=http://127.0.0.1:3000`) — PASS (all workspaces).
- `pnpm check:openapi-drift` — PASS (exit 0).
- `git diff --check` — PASS.
- Prettier run over every touched file — clean.

## Deferred

- Fact enrichment (price/area/rooms fields on the property aggregate) — when
  added to the allowlist with resolvers, the corresponding placeholders
  disappear; until then they are honestly unknown.
- Approval-time re-scan of edited drafts against the denylist (generation-time
  guard only; EF-402 editing rules are unchanged).
- Generated typed client methods for the two new operations (supervisor-owned
  client inventory).
