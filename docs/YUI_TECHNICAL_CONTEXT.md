# EstateFlow — Yui Technical Context

## Purpose

Training-demo real-estate operations platform. It simulates a small office using synthetic data only; it is not a pilot or production service.

## Approved demo flow

```text
Property → customer inquiry → Lead → follow-up → viewing
→ deal → commission/receivable → payment → owner financial report
```

## Architecture

- Web: Next.js, Arabic-first.
- API: NestJS modular monolith.
- Data: PostgreSQL/PostGIS with the Prisma migration baseline added in EF-104; domain models begin in their owning tasks.
- Async: Redis/BullMQ worker shell exists; transactional outbox processing begins in EF-302.
- Boundaries: business rules stay feature-owned; shared candidates remain internal modules until a second product proves reuse.

## Current implementation state

- EF-007: approved for Training Demo scope; see `docs/handoffs/EF-007-scope-approval.md`.
- EF-101: workspace/tooling foundation verified PASS.
- EF-102: isolated PostgreSQL/PostGIS and Redis infrastructure verified PASS.
- EF-103: NestJS bootstrap, configuration/health/error/observability baseline verified PASS.
- EF-104: Prisma/PostGIS migration baseline, DI-managed PrismaService, guarded integration harness, and FK-safe cleanup verified PASS.
- EF-105: Arabic-first Next.js App Router shell, reusable design tokens, responsive demo states, and visual evidence verified PASS.
- EF-106: OpenAPI generation, derived typed API client, and contract-drift check independently verified PASS after EF-106-C1 correction.
- EF-107: local pinned read-only CI workflow and static contract verifier independently verified PASS; no remote GitHub Actions run has occurred because the workspace is not Git/published.
- No customer data, credentials, external providers, deployment, or live business workflow exists; business-domain schema begins in its owning tasks.

## Package ownership

- `apps/api`: NestJS API with a DI-managed Prisma database boundary from EF-104.
- `apps/web`: Next.js UI; Arabic app shell starts in EF-105.
- `apps/worker`: async processing shell; transactional outbox processor starts in EF-302.
- `packages/config`: typed runtime environment contract; implementation starts in EF-103.

## Canonical commands

```bash
source ~/.nvm/nvm.sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm format:check
```

## Constraints

- Node 24.14.1 and pnpm 10.33.2 are pinned.
- Never put secrets, real customer data, provider tokens, or production configuration in this workspace.
- Do not commit, push, deploy, or create public access without Mamdouh's explicit request.
