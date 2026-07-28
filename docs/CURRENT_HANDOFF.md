# EstateFlow — Current Handoff

## Resume instruction

Continue EstateFlow from **independent verification of EF-107 executor evidence** only. Read this file, `docs/TASKS.md`, `docs/YUI_TECHNICAL_CONTEXT.md`, `docs/DEVELOPMENT_PLAN.md`, and `docs/handoffs/EF-107/worker-report.md` before acting.

## Project root

```text
/home/server/projects/estateflow
```

The workspace is currently **not a Git repository**. Use a checksum baseline for each task packet. Do not commit, push, deploy, or expose services publicly.

## Product scope

EstateFlow is an Arabic-first, demo-first training platform using synthetic data only.

Approved demo flow:

```text
Property → customer inquiry → Lead → follow-up → viewing
→ deal → commission/receivable → payment → owner financial report
```

## Verified progress

- EF-101 — monorepo/workspace foundation: **DONE / PASS**.
- EF-102 — isolated PostgreSQL/PostGIS and Redis local/test infrastructure: **DONE / PASS**.
- EF-103 — NestJS bootstrap, configuration, health, errors, request IDs, and observability: **DONE / PASS**.
- EF-104 — Prisma/PostGIS migration baseline, DI-managed PrismaService, destructive-test guard, and FK-safe integration cleanup: **DONE / PASS**.
- EF-105 — Arabic-first Next.js App Router shell and design-token foundation: **DONE / PASS**.
- EF-106 — OpenAPI generation, derived typed API client, and contract-drift check: **DONE / PASS**.
- EF-107 — local CI workflow and static quality-gate contract: **DONE / PASS**.

EF-106 corrective executor evidence is recorded in:

```text
docs/handoffs/EF-106-C1/task-packet.json
docs/handoffs/EF-106-C1/pre-execution.sha256
docs/handoffs/EF-106-C1/worker-report.md
```

EF-106-C1 and EF-107 received independent verification. The project remains local-only; no GitHub Actions run has occurred because there is no Git repository or push.

EF-104 evidence:

```text
docs/handoffs/EF-104/task-packet.json
docs/handoffs/EF-104/pre-execution.sha256
docs/handoffs/EF-104/verification.md
```

Final EF-104 checks:

```text
pnpm lint              PASS
pnpm typecheck         PASS
pnpm test              7/7 PASS
pnpm test:integration  1/1 PASS
pnpm build             PASS
pnpm format:check      PASS
prisma validate        PASS
prisma migrate status  UP TO DATE
scope audit             PASS (16 changed, 0 deleted, 0 outside)
```

The isolated test containers and temporary volumes were stopped and removed after verification. No service needs to remain running.

## Next task

**EF-120 — Authentication domain: credentials, sessions, recovery, lockout, and rate limits** is the next planned task.

Do not start EF-120 until Mamdouh explicitly chooses it. It introduces authentication and requires its own reviewed packet and security boundaries.

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

Integration tests require the EF-102 isolated test stack, the exact loopback test URL, and `ALLOW_DESTRUCTIVE_TESTS=1`; the guard must pass before any database mutation.
