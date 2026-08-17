# EstateFlow

> **Status:** In progress — Arabic-first Training Demo

EstateFlow is a real-estate operations learning and portfolio project. It models a custom-first workflow for listings, broker CRM, finance, automation, content/marketing, viewing scheduling, and contract audit using synthetic data only. It is not a production service, hosted offering, or completed authentication product.

## Verified progress

The following accepted slices are recorded in `docs/CURRENT_HANDOFF.md` with independent verification evidence:

- **EF-101 through EF-107:** workspace/tooling, isolated local/test infrastructure, API health baseline, Prisma/PostGIS baseline, Arabic-first web shell, OpenAPI-derived typed client, and local CI workflow.
- **EF-120 and EF-121:** authentication/session security plus organization persistence and RBAC.
- **EF-201 through EF-203:** property/listing, lead CRM notes/tasks, and terminal deal outcomes.
- **EF-231 and EF-232:** ledger core and commission persistence/HTTP/OpenAPI/client plus Arabic command workspace.
- **EF-233 T0 through T2:** explicit invoice amount authority, durable receivable/payment persistence, idempotency under concurrency, and issued-invoice database immutability.

The next bounded task is **EF-233 T3 — guarded invoice/payment HTTP commands**. This repository has local CI configuration; a remote GitHub Actions run is not claimed as passing until GitHub reports it.

## Architecture overview

EstateFlow is a modular monolith with an Arabic-first Next.js web application, a NestJS API, PostgreSQL/PostGIS data storage through Prisma, and Redis/BullMQ for deferred work. The intended application flow is:

```text
Web UI → typed API contract → application use-case → domain policy → repository adapter
```

The public database material is limited to the Prisma schema, versioned migrations, PostGIS initialization, and isolated local/test Compose templates. No database dump, volume, operational record, or real data is included.

## Local quick start

1. Install Node.js and pnpm versions supported by `package.json`.
2. Copy `.env.example` to `.env`; replace every `YOUR_*` value with values for an isolated local setup. Do not commit `.env`.
3. Install dependencies:

   ```bash
   pnpm install --frozen-lockfile
   ```

4. Review the local infrastructure template before starting it. Local and test Compose templates are intentionally separate; do not point either at real data.
5. Run the non-integration quality checks:

   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   pnpm format:check
   ```

## Test and integration safety

Integration tests require the isolated test stack and explicit destructive-test safety configuration. They can mutate only that dedicated test database. Do not run them against a local, shared, customer, or production database. This repository does not provide a hosted runtime or production deployment path.

## Portfolio learning evidence

The repository preserves architecture decisions, task boundaries, verification handoffs, OpenAPI contract work, database migration material, and quality-gate configuration. These artifacts demonstrate the project's learning focus: modular boundaries, Arabic-first UI foundations, safe data handling, API contracts, and repeatable verification.

## Safety and data policy

Never add secrets, credentials, tokens, private keys, real connection strings, database dumps, operational data, or customer data. See [the public repository boundary](docs/PUBLIC_REPOSITORY.md) and [security reporting guidance](SECURITY.md).

## License

EstateFlow is available under the [MIT License](LICENSE).
