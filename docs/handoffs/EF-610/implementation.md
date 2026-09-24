# EF-610 — Contracts implementation

**Task:** `ESTATEFLOW-EF610-CONTRACTS-001`
**Provider/model:** `zai/glm-5.3-flash`
**Verdict:** **PASS**

> ⚠️ **Classification: operational/simple e-sign — NOT a certified legal
> signature.** The exact Arabic label «توقيع تشغيلي مبسّط — ليس توقيعًا
> قانونيًا معتمدًا» is stamped on every generated document, surfaced in every
> API view payload, enforced by the web normalizers, and displayed as a banner
> in the Arabic UI. No certified e-sign integration (DocuSign etc.) is wired —
> deferred per PRD.

## Delivered

- **Org-scoped versioned contract templates** (`domain/contract-template.ts`, DB `ContractTemplate`): EF-305 patterns — rows are created as DRAFT by Owner/Manager, approved once (complete transition with `approvedBy`/`approvedAt` enforced by the DB trigger `ef610_template_immutable`), and approved rows are fully immutable forever; template history is never deletable (`ef610_template_no_delete`). A new version is a new row under the same `templateKey` (unique per `(organizationId, templateKey, version)`). Templates carry a title pattern and a body pattern whose variables are the **strict snapshot slot allowlist** (`ORGANIZATION_NAME`, `DEAL_REFERENCE`, `DEAL_STATUS`, `PROPERTY_TITLE`, `PROPERTY_TYPE`, `PROPERTY_ADDRESS`, `BROKER_REFERENCE`, `SNAPSHOT_CAPTURED_AT`); unknown `{SLOT}` names and EF-403-style `[BRACKET]` fact tokens are rejected at template creation with a typed error — nothing can enter a contract that the snapshot does not carry.
- **Immutable deal/property data snapshot** (`domain/contract-snapshot.ts`): generation captures the deal (id/lead/status/version), its property (identity + version + facts), the organization name, and the ordered signing parties into a frozen `schemaVersion: 1` snapshot stored verbatim on the contract. Signer ordering is deterministic: order 1 = the deal's active broker (with its organization-scoped account-identifier reference), order 2 = the organization principal (first ACTIVE OWNER by `createdAt`, then `userId`). Snapshots carry operational membership references only — no customer PII (leads hold none by design), no credentials, no free-form text. The snapshot, rendered title/body, content hash, PDF hash and full provenance (template id/key/version, generatedBy, createdAt) are **immutable from creation** by the `ef610_contract_immutable` trigger — regeneration means a NEW contract, never a mutation.
- **Deterministic generation**: content = f(approved template version, snapshot) — pure renderer, no clock/randomness inside the render path; `contentHash` = SHA-256 over a canonical string of (template key, version, title, body). Only APPROVED templates can generate (latest approved version or explicit `templateVersion`).
- **PDF without new dependencies** (`domain/minimal-pdf.ts`): an in-repo minimal deterministic PDF 1.4 writer — A4 pages, Helvetica core font, uncompressed content streams, classic xref table with exact byte offsets, greedy deterministic word wrap, pagination capped at 60 pages. **Zero new dependencies** (no PDF library). Non-WinAnsi characters (the Arabic body) are emitted as lossless deterministic `U+XXXX` escapes; readable Arabic glyph rendering with an embedded font is EF-630's explicit plan scope ("PDF Arabic font embedding") — documented in the generator header and on the document itself. `pdfSha256` (SHA-256 of the bytes) and `pdfByteSize` are recorded at generation; bytes are never stored — the document is regenerated deterministically on demand and **verified against the stored hash before release** (a drifted/tampered row can never surface as a valid-looking PDF). The PDF is frozen: content inputs are immutable rows.
- **Sequential signing** (`domain/contract.ts` + DB): the ordered snapshot signers define a total order; only the exact next signer may sign (`expectNextSignature` — typed `SIGNER_NOT_NEXT`/`SIGNATURE_OUT_OF_ORDER` rejections; wrong person/right person early/unknown user all rejected). Each `ContractSignature` row stores `signerUserId`, `signerRole`, `signedAt`, and `documentHash` = the contract's exact `pdfSha256`. The **database trigger `ef610_signature_sequential_insert`** independently re-validates every insert: contract must be DRAFT, order must be exactly next (existing count + 1), signer identity/role must match the snapshot entry for that order, and the document hash must equal the contract PDF hash — raw SQL out-of-order/wrong-signer/wrong-hash inserts are rejected in integration proof. When the last ordered signature lands, the same transaction finalizes: status → `FINALIZED` with `finalizedAt`, and the contract becomes **fully frozen** — the trigger rejects every further column change (including any status move) and requires signature-count/hash-match completeness before allowing finalization in the first place.
- **Append-only audit** (`ContractAuditEvent` + `ef610_audit_append_only`): every lifecycle action appends an event — `GENERATED` (with provenance data: template id/key/version, deal id, content hash, pdf hash, disclaimer), `SIGNATURE_RECORDED` (order + document hash), `FINALIZED`, `AMEND_REQUESTED` (typed Owner/Manager/Broker action while DRAFT with a mandatory reason; audit-only, the document itself can never be edited), `VOIDED` (Owner only + mandatory reason). Updates and deletes are rejected at the database with no exceptions.
- **Void**: Owner role only, DRAFT-only, mandatory non-empty reason (≤500 chars); writes `voidedBy/voidedAt/voidReason` and the `VOIDED` audit event in one transaction; voided rows are frozen by the trigger (even `voidReason` cannot change).
- **Schema/migration**: `ContractStatus`/`ContractTemplateStatus`/`ContractAuditAction` enums; `ContractTemplate`, `Contract`, `ContractSignature`, `ContractAuditEvent` tables with composite `(organizationId, id)` uniques, composite tenant FKs (`Contract→Deal`, `Contract→ContractTemplate`, `ContractSignature→Contract`, `ContractAuditEvent→Contract`), status/order indexes, and the five triggers above (migration `20261003000000_ef610_contracts`, applied to `estateflow_test` only). `schema.prisma` edited (pre-approved deviation).
- **HTTP boundary** (`http/contract.controller.ts`, `@ApiExcludeController` per EF-601 precedent — `apps/api/test/openapi.test.mjs` untouched). New routes (none in the closed-world OpenAPI document):
  - `POST /organizations/:organizationId/contract-templates` (Owner/Manager)
  - `POST /organizations/:organizationId/contract-templates/:templateId/approve` (Owner/Manager)
  - `GET  /organizations/:organizationId/contract-templates` (Owner/Manager/Broker)
  - `GET  /organizations/:organizationId/contract-templates/slots` (slot catalog for the editor)
  - `POST /organizations/:organizationId/contracts/generate` (Owner/Manager/Broker)
  - `GET  /organizations/:organizationId/contracts?dealId=` (Owner/Manager/Broker)
  - `GET  /organizations/:organizationId/contracts/:contractId` (Owner/Manager/Broker)
  - `GET  /organizations/:organizationId/contracts/:contractId/pdf` (hash-verified PDF stream; `application/pdf`, `Cache-Control: private, no-store`)
  - `POST /organizations/:organizationId/contracts/:contractId/signatures` (next signer only)
  - `POST /organizations/:organizationId/contracts/:contractId/amend-requests` (Owner/Manager/Broker, reason required)
  - `POST /organizations/:organizationId/contracts/:contractId/void` (Owner, reason required)

  Typed errors surface as: 400 validation (`CONTRACT_VALIDATION_ERROR`, `CONTRACT_TEMPLATE_VALIDATION_ERROR`, `CONTRACT_SNAPSHOT_ERROR`), 403 authority (`ContractAccessDeniedError`), 404 tenant-safe (`ContractNotFoundError` — foreign org/deal/contract ids never leak existence), 409 state (`SIGNATURE_OUT_OF_ORDER`, `SIGNER_NOT_NEXT`, `CONTRACT_NOT_DRAFT`, `CONTRACT_FINALIZED`, `CONTRACT_VOIDED`). Strict class-validator DTO allowlists; unsafe routes behind canonical-origin + session + CSRF guards, reads behind the session guard — exactly the established pattern.

- **Web (Arabic-first, RTL, mobile-responsive)**: new page `/ar/organizations/:organizationId/contracts` with the mandatory «توقيع تشغيلي مبسّط — ليس توقيعًا قانونيًا معتمدًا» banner, deal-id + approved-template generation flow, template list with create-draft/approve controls (strict slot catalog hint), contract list with status/signature-progress/hash prefixes, inline hash-verified PDF link, per-contract detail with snapshot provenance (property + organization + capture time), full document hashes, ordered signing rail (who signed when with document hash, who is next), the append-only audit timeline with reasons, amend-request and Owner-only void actions with prompt for the mandatory reason. Closed-world normalizers refuse payloads missing the exact disclaimer or carrying wrong shapes (`ef610-contracts-contract.test.ts`).

## New files

- `apps/api/src/features/contracts/**` (domain, application, infrastructure, http, module)
- `apps/api/prisma/migrations/20261003000000_ef610_contracts/`
- `apps/api/test/ef610-contracts.domain.test.mjs`, `ef610-contracts.application.test.mjs`, `ef610-contracts.http.test.mjs`, `ef610-contracts.repository.integration.test.mjs`, `support/ef610-contracts-fixtures.mjs`
- `apps/web/src/features/contracts/*` (contract, api, workspace, css), `apps/web/src/app/ar/organizations/[organizationId]/contracts/page.tsx`, `apps/web/src/test/ef610-contracts-contract.test.ts`
- Modified: `apps/api/prisma/schema.prisma`, `apps/api/src/app.module.ts`

## Tests and evidence

- Unit: 8 domain tests (snapshot determinism/strict signers/round-trip, slot allowlist resolution, template validation/approval lifecycle, deterministic rendering, content-hash stability/sensitivity, PDF determinism + xref-offset/structure verification + escape losslessness, wrap bounds, generated-document hash identity, next-signer typing + void/finalize state machine), 7 application tests (template authority matrix, generation provenance + deterministic content hash + tenant-safe 403/404 split, sequential signing with typed out-of-order rejection and FINALIZED freeze + audit sequence `GENERATED → SIGNATURE_RECORDED×2 → FINALIZED`, void authority/reason/audit, amend-request audit-only no-mutation, hash-verified PDF regeneration, org-scoped listing), 4 HTTP tests (11 routes with exact methods/guards, `@ApiExcludeController` metadata, strict DTO allowlists incl. forbidNonWhitelisted, typed error→status mapping).
- Integration on `estateflow_test` (`ESTATEFLOW_TEST_DB_PORT=55435`, loopback, `ALLOW_DESTRUCTIVE_TESTS=1`): 3 tests — full lifecycle with persisted deterministic hashes (twin generation: equal content hash, different document hash by design since the PDF embeds its contract id), raw-SQL trigger proofs (template immutability, contract content/snapshot immutability, no-delete, out-of-order/wrong-signer/wrong-hash signature insert rejection, FINALIZED freeze, signature + audit append-only), audit sequence and provenance data, deterministic PDF regeneration for DRAFT and FINALIZED rows matching the stored `pdfSha256`/`pdfByteSize`, tenant isolation (other-org member 404, zero cross-tenant rows), authority (Client denied); void lifecycle with owner+reason audit and voided-row freeze + signature rejection; FK-safe cleanup leaving all contract tables empty.

## Fresh gate evidence

- `pnpm lint` — **PASS** (workspace + infrastructure checks included).
- `pnpm typecheck` — **PASS** (api + web).
- `pnpm test` — **PASS**: API unit suite 62 files (incl. the 3 new EF-610 files); Web 90 tests; worker, api-client, design-tokens, config all green.
- `ESTATEFLOW_TEST_DB_PORT=55435 DATABASE_URL=postgresql://estateflow_test:test_only_change_me@127.0.0.1:55435/estateflow_test ALLOW_DESTRUCTIVE_TESTS=1 pnpm test:integration` — **PASS**: API integration suite 32 files (incl. `ef610-contracts.repository.integration.test.mjs`); worker integration suites PASS.
- `API_ORIGIN=http://127.0.0.1:3000 pnpm build` — **PASS**, including the new Arabic contracts route.
- `pnpm check:openapi-drift` — **PASS** (document unchanged; the contracts controller is excluded per EF-601 precedent; new routes listed above).
- `git diff --check` — **PASS**.
- Prettier touched-file check — **PASS** (all EF-610 files reformatted and re-verified: lint/build/unit tests re-run green after formatting).

## Boundary compliance

No new dependencies (the deterministic PDF writer is in-repo; `package.json`/`pnpm-lock.yaml` untouched). No certified e-sign integration. No `apps/api/test/openapi.test.mjs` edits (routes listed above). No `apps/worker` changes. No commit/push/deploy/shared DB/`.env`/AGENTS/`apps/web/src/app/en` changes. Documented, packet-pre-approved deviations used: `schema.prisma` edits and new `apps/api/test/ef610-*` files.
