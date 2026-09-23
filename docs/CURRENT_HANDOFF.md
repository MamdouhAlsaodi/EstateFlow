# EstateFlow — Current Handoff

## Resume instruction

Before acting, read this file, `docs/TASKS.md`, `docs/YUI_TECHNICAL_CONTEXT.md`, `docs/DEVELOPMENT_PLAN.md`, and the independent verification reports for EF-120-I, EF-120-II, and EF-120-III:

```text
docs/handoffs/EF-120-I/independent-verification.md
docs/handoffs/EF-120-II/independent-verification.md
docs/handoffs/EF-120-III/independent-verification.md
```

## Project root

```text
/home/server/projects/estateflow
```

The workspace is a Git repository. The verified EF-233 closure is authorized for commit/push by the user after all local gates pass. No deployment, live-service mutation, or public exposure is authorized.

## Product scope

EstateFlow is an Arabic-first, demo-first training platform using synthetic data only.

Approved demo flow:

```text
Property → customer inquiry → Lead → follow-up → viewing
→ deal → commission/receivable → payment → owner financial report
```

## Verified progress

- EF-101 — workspace/tooling foundation: **PASS**.
- EF-102 — isolated PostgreSQL/PostGIS and Redis local/test infrastructure: **PASS**.
- EF-103 — NestJS bootstrap, configuration, health, errors, request IDs, and observability: **PASS**.
- EF-104 — Prisma/PostGIS migration baseline, DI-managed PrismaService, destructive-test guard, and FK-safe integration cleanup: **PASS**.
- EF-105 — Arabic-first Next.js App Router shell and design-token foundation: **PASS**.
- EF-106 — OpenAPI generation, derived typed API client, and contract-drift check: **PASS**.
- EF-107 — local CI workflow and static quality-gate contract: **PASS**.
- EF-120-I — authentication persistence/session verification: **PASS**.
- EF-120-II — authentication HTTP/session boundary verification: **PASS**.
- EF-120-III — recovery, abuse-control, audit, isolated PostgreSQL, and runtime verification: **PASS**.
- EF-121 — organization persistence, RBAC, protected HTTP authorization, isolated PostgreSQL integration, and Nest runtime smoke: **PASS**.
- EF-201 — Basic Property/Listing backend/API workflow: **PASS**. Evidence: `docs/handoffs/EF-201/T5-verification.md`.
- EF-202 — Lead pipeline, append-only timeline, CRM-04 Notes/Tasks, typed OpenAPI/client, and Arabic-first inline Lead Workspace: **PASS**. Evidence: `docs/handoffs/EF-202/EF-202-independent-verification-2026-08-13.md`.
- EF-203 T1 — typed terminal Lead and Deal-close domain/application contract: **PASS**. Evidence: `docs/handoffs/EF-203/T1-independent-verification-2026-08-13.md`.
- EF-203 T2 — tenant-scoped Deal persistence, terminal outcomes, idempotency replay, and guarded PostgreSQL integration: **PASS**. Evidence: `docs/handoffs/EF-203/T2-deal-persistence-atomic-executor.md`, `docs/handoffs/EF-203/T2-R1-persistence-acceptance-executor.md`, and `docs/handoffs/EF-203/T2-R2-won-stale-evidence-executor.md`.
- EF-203 T3 — guarded close HTTP boundary with opaque session, canonical Origin/CSRF, idempotency, tenant-safe `404`, and real PostgreSQL request verification: **PASS**. Evidence: `docs/handoffs/EF-203/T3-independent-verification-2026-08-14.md`.
- EF-203 T4 — exact Swagger/OpenAPI contract and closed-world generated typed client for close commands: **PASS**. Evidence: `docs/handoffs/EF-203/T4-independent-verification-2026-08-14.md`.
- EF-203 T5 — Arabic inline Lead Workspace close controls using same-origin CSRF/idempotency transport and reload-only terminal UI: **PASS**. Evidence: `docs/handoffs/EF-203/EF-203-independent-verification-2026-08-14.md`.
- EF-203 — terminal Deal outcome workflow: **CLOSED / PASS**. Evidence: `docs/handoffs/EF-203/EF-203-independent-verification-2026-08-14.md`.
- EF-231 T1 — Money, chart-account, balanced-journal/reversal/period domain policy and typed application authorization: **PASS**. Evidence: `docs/handoffs/EF-231/T1-independent-verification-2026-08-14.md`.
- EF-231 T2 — guarded PostgreSQL ledger schema and atomic persistence, including persisted-line balance verification before posting: **PASS**. Evidence: `docs/handoffs/EF-231/T2-independent-verification-2026-08-14.md`.
- EF-231 T2-R2 — typed OPEN accounting-period creation with Owner/Manager authorization and guarded persistence: **PASS**. Evidence: `docs/handoffs/EF-231/T2-R2-independent-verification-2026-08-14.md`.
- EF-231 T2-R3 — persisted organization-scoped period lookup by `periodId` before posting: **PASS**. Evidence: `docs/handoffs/EF-231/T2-R3-independent-verification-2026-08-14.md`.
- EF-231 T2-R4 — persisted organization-scoped journal-entry lookup by `entryId` before posting or reversal: **PASS**. Evidence: `docs/handoffs/EF-231/T2-R4-independent-verification-2026-08-14.md`.
- EF-231 T2-R5 — primitive account/draft commands with persisted organization-scoped account lookup: **PASS**. Evidence: `docs/handoffs/EF-231/T2-R5-independent-verification-2026-08-14.md`.
- EF-231 T2-R6 — transport-neutral typed ledger validation/state errors, preserving unknown error propagation: **PASS**. Evidence: `docs/handoffs/EF-231/T2-R6-independent-verification-2026-08-14.md`.
- EF-231 T2-R7 — schema-valid application-generated reversal UUID while preserving reversal linkage and source immutability: **PASS**. Evidence: `docs/handoffs/EF-231/T2-R7-independent-verification-2026-08-14.md`.
- EF-231 T3 — guarded five-command ledger HTTP boundary, bigint-safe DTO/response behavior, real lifecycle and tenant-isolation proof: **PASS**. Evidence: `docs/handoffs/EF-231/T3-independent-verification-2026-08-14.md`.
- EF-231 T3-R3 — self-contained synthetic runtime for canonical OpenAPI generation/drift, without DB or secrets: **PASS**. Evidence: `docs/handoffs/EF-231/T3-R3-independent-verification-2026-08-14.md`.
- EF-231 T4 — exact Swagger/OpenAPI contract and closed-world generated client for the five guarded ledger commands: **PASS**. Evidence: `docs/handoffs/EF-231/T4-independent-verification-2026-08-14.md`.
- EF-232 T1 — persisted-authority commission domain/application contract: default 5% plan, 60/40 split, deterministic residual allocation, lifecycle, and Owner/Manager boundary: **PASS**. Evidence: `docs/handoffs/EF-232/T1-independent-verification-2026-08-14.md`.
- EF-232 T1-R1/R2 — authorized primitive plan-version command plus assertion-free explicit-policy narrowing / half-policy no-mutation proof: **PASS**. Evidence: `docs/handoffs/EF-232/T1-R1-R2-independent-verification-2026-08-14.md`.
- EF-232 T2 — guarded durable commission persistence: migration nine, composite tenant FKs, immutable authority/split snapshots, concurrent same-event replay, and full authority matrix: **PASS**. Evidence: `docs/handoffs/EF-232/T2-independent-verification-2026-08-15.md`.
- EF-232 T3 — exact three guarded commission HTTP commands, strict bigint-safe DTO boundary, Owner/Manager matrix, replay, tenant no-mutation proof, and type-safe serialized response boundary: **PASS**. Evidence: `docs/handoffs/EF-232/T3-independent-verification-2026-08-15.md`.
- EF-232 T4 — closed OpenAPI and generated client for exactly the three accepted commission commands; strict default-or-complete-policy union; generation/drift/client contract proof: **PASS**. Evidence: `docs/handoffs/EF-232/T4-independent-verification-2026-08-15.md`.
- EF-232 Web — Arabic organization-scoped command workspace for exactly plan creation, commissionable-value capture, and expected accrual; same-origin CSRF transport, strict client preflight, real replay messaging, production Next build: **PASS**. Evidence: `docs/handoffs/EF-232/WEB-independent-verification-2026-08-15.md`.
- EF-233 T0/T1/T2 — accepted invoice/receivable/payment authority, domain/application contract, guarded persistence, concurrency recovery, durable idempotency, and issued-invoice database immutability: **PASS**. Evidence: `docs/handoffs/EF-233/T0-receivable-invoice-payment-contract.md`, `docs/handoffs/EF-233/T1-independent-verification-2026-08-15.md`, and `docs/handoffs/EF-233/T2-independent-verification-2026-08-16.md`.
- EF-233 T3 — exactly three guarded Owner/Manager HTTP commands for draft, issue, and payment; strict bigint/UTC DTOs, server-owned replay-safe payment identity, tenant-safe errors, and isolated PostgreSQL runtime proof: **PASS**. Evidence: `docs/handoffs/EF-233/T3-independent-verification-2026-08-17.md`.
- EF-233 T4 — exact Swagger/OpenAPI publication and closed-world generated client for the same three commands; payment-only idempotency header, exact schemas/statuses, unsupported-operation rejection, deterministic formatted generation, and drift proof: **PASS**. Evidence: `docs/handoffs/EF-233/T4-independent-verification-2026-08-17.md`.
- EF-233 T5A/T5B — cancellation/aging domain/application and guarded PostgreSQL persistence, immutable one-way cancellation audit, payment race safety, and stable bounded aging cursor: **PASS**. Evidence: `docs/handoffs/EF-233/T5A-independent-verification-2026-08-17.md` and `docs/handoffs/EF-233/T5B-independent-verification-2026-08-17.md`.
- EF-233 T5C/T5D — guarded cancellation/aging HTTP plus exact OpenAPI and deterministic generated client: **PASS**. Evidence: `docs/handoffs/EF-233/T5C-independent-verification-2026-08-17.md` and `docs/handoffs/EF-233/T5D-independent-verification-2026-08-17.md`.
- EF-233 T5E — Arabic organization-scoped cancellation and aging workspace with strict client normalization and live visual/DOM review: **PASS**. Evidence: `docs/handoffs/EF-233/T5E-independent-verification-2026-08-17.md`.
- EF-233 / FIN-03 — complete PRD reconciliation, 12 migrations, isolated unit suites, 14 serial PostgreSQL integration files / 21 tests, production builds, OpenAPI drift, formatting, and cleanup: **CLOSED / PASS**. Evidence: `docs/handoffs/EF-233/EF-233-final-verification-2026-08-17.md`.
- EF-234 / FIN-04 — expenses with category, vendor/payee reference, campaign/property/deal dimensions, approval threshold policy (maker-checker with recorded below-threshold auto-approval), metadata-only evidence attachments with idempotent replay, guarded five-command HTTP boundary, exact OpenAPI + closed-world generated client, Arabic-first expense workspace, and database-enforced snapshot/audit immutability (migration thirteen): **PASS**. Evidence: `docs/handoffs/EF-234/EF-234-final-verification-2026-09-21.md`.
- EF-235 / FIN-05 — Owner-only read-only finance dashboard: cash-in/out, receivables aging (exact EF-233 bucket semantics), commissions due/paid/expected, revenue/margin by deal and by property, freshness timestamp on every payload, bounded tenant-scoped drill-down for every figure, exact OpenAPI + closed-world generated client, Arabic-first reports page, and a seeded report-to-ledger reconciliation test proving every figure equals the exact sum of its source rows including a cancellation period (CSV/PDF deferred to FIN-07): **PASS**. Evidence: `docs/handoffs/EF-235/EF-235-implementation-2026-09-23.md`.
- EF-301 + EF-302 — versioned tenant-scoped automation rules, guarded Owner/Manager rule commands, durable idempotent jobs, bounded retry/backoff, typed failed-job visibility, and callable API-side scheduler: **PASS within packet boundary**. Evidence: `docs/handoffs/EF-301/implementation.md` and `docs/handoffs/EF-302/implementation.md`.
- EF-304 — receivable due-soon/overdue and commission-due rules, deterministic payment/paid-reset occurrences, durable fake-delivery-compatible in-app notifications, API-owned scheduler sweep, worker replay safety, and Arabic finance-job visibility: **PASS within packet boundary**. Evidence: `docs/handoffs/EF-304/implementation.md`.
- EF-305 — organization-scoped Arabic/English notification templates with immutable approved versions, Owner/Manager approval-gated sends, audited transitions, DST-safe quiet hours, recipient consent/opt-out suppression, in-app fake provider port, templated finance worker delivery, and Arabic notification visibility: **PASS within packet boundary**. Evidence: `docs/handoffs/EF-305/implementation.md`.
- EF-306 — Arabic-first automation UI closing Phase 3: rule list/detail with immutable version timeline, organization/rule execution history with typed states and failure reasons, guarded job history/detail/retry/cancel endpoints (retry creates a NEW idempotent job occurrence; cancel only for queued/retrying; Owner/Manager authority), OpenAPI/client regeneration, and web/backend tests: **PASS within packet boundary**. Evidence: `docs/handoffs/EF-306/implementation.md`.
- EF-401 / FIN-06 (campaign dimension) — Campaigns and attribution opening Phase 4: org-scoped campaign aggregate (objective, channel, dates, planned/actual budget, UTM tags) with audited draft→active→completed/cancelled lifecycle, append-only budget corrections with mandatory audit reason, EF-234 expense campaign dimension graduated to a real composite tenant FK (nullable migration; legacy opaque references preserved), append-only Lead touches with deterministic first-touch/last-touch attribution and audited override corrections, manual performance entry only (no ad-platform calls), campaign dimension in owner revenue/margin reporting reconciling to Finance Core, Arabic campaign list/detail with budget progress and attribution view, guarded OpenAPI/client regeneration, and PostgreSQL integration proof on `estateflow_test`: **PASS within packet boundary**. Evidence: `docs/handoffs/EF-401/implementation.md`.

- EF-402 — Content workflow continuing Phase 4: org-scoped content aggregate with idea → draft → review → approved → scheduled → published/failed lifecycle (append-only audited transitions; DB-enforced transition matrix), approval locks the content version with a sha256 content hash, published content and the audited transition history are immutable via database triggers, failed publishing records a typed failure kind + mandatory reason, a revision creates a NEW DRAFT variant through the same lifecycle under one lineage, review queue (oldest first) and UTC calendar queries, full authority matrix (Owner/Manager approve/schedule/publish/fail; Broker drafts/edits/submits/revises; CLIENT denied), optional composite-tenant-FK campaign link, Arabic-first content list/review-queue/calendar/detail with version timeline, guarded OpenAPI regeneration, and PostgreSQL integration proof on `estateflow_test`: **PASS within packet boundary**. Evidence: `docs/handoffs/EF-402/implementation.md`.

EF-120, EF-121, EF-201, EF-202, EF-203, EF-231, EF-232, EF-233, EF-234, EF-235, EF-301, EF-302, EF-303, EF-304, EF-305, EF-306, EF-401, and EF-402 are closed within their documented boundaries. **Phase 3 (Automation & Reminders) is COMPLETE; Phase 4 (Content & Campaigns) is OPEN with EF-401 and EF-402 done.**

## EF-120 authentication decision

- HttpOnly, Secure, SameSite=Lax cookie session.
- Canonical Origin enforcement and CSRF protection.
- Opaque server-side sessions.
- Argon2id password hashing.
- One-time hashed secrets.
- Abuse controls and structured audit events.

## EF-120 final proof summary

The final independent verification recorded:

```text
Final non-database tests: 100/100 PASS
Configuration tests: 2/2 PASS
PostgreSQL integration tests: 10/10 PASS
Runtime verification: PASS
Cleanup verification: PASS
```

Evidence:

```text
docs/handoffs/EF-120-I/independent-verification.md
docs/handoffs/EF-120-II/independent-verification.md
docs/handoffs/EF-120-III/independent-verification.md
```

No dependency, environment-file, commit, push, deployment, shared/live database, or external-delivery action occurred during EF-120 verification.

## EF-201 verified boundary

- Property/Listing backend/API workflow is closed with independent evidence in `docs/handoffs/EF-201/T5-verification.md`.
- Scope includes organization-scoped property/listing lifecycle, metadata-only image records, guarded HTTP routes, OpenAPI contract, and generated API client support.
- Explicitly deferred: binary image storage/upload, advanced geo/map, feature audit events, and Property/Listing web UI.

## Next task

**EF-402 is CLOSED / PASS within this packet and the content workflow is live:** idea → draft → review → approved → scheduled → published/failed with append-only audited transitions, a database-enforced transition matrix, version + sha256 content hash locked at approval, published content immutable via triggers, typed failure reasons, revision variants re-entering the full lifecycle, review queue and UTC calendar, the full Owner/Manager/Broker authority matrix, and an Arabic-first content workspace. The seven new public content paths (eight operations, listed in `docs/handoffs/EF-402/implementation.md`) await the supervisor-owned `openapi.test.mjs` inventory update (same expected legacy failure pattern as EF-305/EF-306/EF-401); the generated typed client also awaits its supervisor-owned generator contract if wanted. The next product task is **EF-403 Safe listing-to-content generation** (allowlisted property projection, templates per channel, missing facts become placeholders, no invented price/location/area/legal claims). Finance reporting remains read-only and export-free until FIN-07 (PILOT). Evidence: `docs/handoffs/EF-402/implementation.md`.

Environment note: the isolated `estateflow_test` stack on this machine listens on `127.0.0.1:55435` (port 55433 is occupied by an unrelated container). `scripts/assert-test-database.mjs` accepts an explicit `ESTATEFLOW_TEST_DB_PORT` override while keeping every other destructive-test invariant (loopback host, `estateflow_test` user/database, `ALLOW_DESTRUCTIVE_TESTS=1`).

## EF-202 verified boundary

- Closed scope: organization-scoped Lead board/detail, approved state transitions, append-only timeline, immutable Notes, versioned Tasks with create/complete/reschedule, guarded HTTP, generated OpenAPI/client, and Arabic-first inline Lead Workspace.
- The Workspace uses the existing protected Lead detail contract, same-origin CSRF/session transport, fresh idempotency keys, and server reload after every successful command; it has no optimistic child state or browser token storage.
- Independent verification: guarded `estateflow_test` on loopback:55433; six Prisma migrations with no pending work; API `182/182`, generated client `12/12`, Web `27/27`, OpenAPI drift PASS, production Web build PASS with synthetic API origin, and `git diff --check` PASS.
- Explicitly deferred: reminders, lead-inactivity automation/escalation, notifications, task assignment/recurrence, generic PATCH, note edit/delete, child-resource read APIs, and deployment/release.

## Architecture boundaries

- Web: Next.js, Arabic-first.
- API: NestJS modular monolith.
- Data: PostgreSQL/PostGIS with Prisma baseline; business models begin in their owning tasks.
- Async: EF-301/302 provide durable API-side scheduler callables; EF-303 adds concrete Lead executors, the API-owned scheduler tick, and the thin `apps/worker` long-lived runner. Lead action behavior remains API-owned; the worker only drives the tick.
- `btree_gist` remains deferred until the viewing exclusion-constraint task.
- No real customer data, credentials, external providers, production mutation, or deployment.

## Canonical commands

```bash
cd /home/server/projects/estateflow
source ~/.nvm/nvm.sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm format:check
```

Integration tests require the isolated test stack and `ALLOW_DESTRUCTIVE_TESTS=1`; the guard must pass before any database mutation.
