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

The workspace is a Git repository. No commit, push, deployment, or public exposure is authorized. No live services are required.

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

EF-120, EF-121, EF-201, EF-202, and EF-203 are closed within their documented boundaries.

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

**EF-231 and EF-232 (T1 through T4 plus accepted Web command workspace) are closed within their documented boundaries. EF-233 T0/T1/T2 are accepted; guarded HTTP is the next unopened boundary.** Invoice amount authority is an explicit Owner/Manager draft amount for an existing organization-scoped Deal—not Deal, Commissionable Value, or Commission Accrual—and becomes immutable at issue. Issuing atomically creates one receivable; partial payments are exact-money, idempotent, same-currency, and cannot overpay. T2 proves database composite ownership, one receivable per invoice, atomic issue, durable idempotency, no-overpayment under concurrency, and issued-invoice database immutability on `estateflow_test` only. Do not extend EF-233 implicitly to draft amendment/cancellation, ledger posting/reversal, receivable reads/aging/dashboard, exports, reminders, gateway/bank reconciliation, provider behavior, OpenAPI/client/Web, or Deal/Lead changes. T3 must be separately packeted for guarded Owner/Manager HTTP only after scoped controller/DTO/auth precedent review. Contract/evidence: `docs/handoffs/EF-233/T0-receivable-invoice-payment-contract.md`, `docs/handoffs/EF-233/T1-independent-verification-2026-08-15.md`, `docs/handoffs/EF-233/T2-independent-verification-2026-08-16.md`.

## EF-202 verified boundary

- Closed scope: organization-scoped Lead board/detail, approved state transitions, append-only timeline, immutable Notes, versioned Tasks with create/complete/reschedule, guarded HTTP, generated OpenAPI/client, and Arabic-first inline Lead Workspace.
- The Workspace uses the existing protected Lead detail contract, same-origin CSRF/session transport, fresh idempotency keys, and server reload after every successful command; it has no optimistic child state or browser token storage.
- Independent verification: guarded `estateflow_test` on loopback:55433; six Prisma migrations with no pending work; API `182/182`, generated client `12/12`, Web `27/27`, OpenAPI drift PASS, production Web build PASS with synthetic API origin, and `git diff --check` PASS.
- Explicitly deferred: reminders, lead-inactivity automation/escalation, notifications, task assignment/recurrence, generic PATCH, note edit/delete, child-resource read APIs, and deployment/release.

## Architecture boundaries

- Web: Next.js, Arabic-first.
- API: NestJS modular monolith.
- Data: PostgreSQL/PostGIS with Prisma baseline; business models begin in their owning tasks.
- Async: Redis/BullMQ worker shell; transactional outbox begins in EF-302.
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
