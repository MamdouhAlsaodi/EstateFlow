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

EF-120 and EF-121 are closed.

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

## Next task

**EF-201 — Basic Property/Listing workflow** is next. It depends on EF-121 and EF-104 and must start with a bounded read-only CTO requirements/architecture handoff before any product-source change.

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
