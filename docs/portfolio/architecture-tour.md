# EstateFlow — Architecture tour (EF-704 preparation)

> **Draft, not a portfolio release.** This describes code in the repository, not an observed deployment or customer workflow. [The Phase 7 plan](../DEVELOPMENT_PLAN.md) makes EF-704 dependent on EF-703; [the task register](../TASKS.md) has not accepted EF-701–EF-705. The [pre-Pilot guide](../pilot/quick-guide-draft.md) is training material using synthetic data, not Pilot evidence.

## Repository boundaries

- The [pnpm workspace](../../pnpm-workspace.yaml) groups `apps/*` and `packages/*`. The [API bootstrap](../../apps/api/src/main.ts) creates a NestJS app, installs request-ID and request-logging middleware, global validation and error handling, and builds its OpenAPI document.
- The [web app's Arabic route](../../apps/web/src/app/ar/page.tsx) is a Next.js UI. The [lead API wrapper](../../apps/web/src/lib/api-client/leads.ts) and [generated client](../../packages/api-client/src/generated.ts) show the typed HTTP boundary; [contract drift checks](../../scripts/check-openapi-drift.mjs) compare the generated client with the committed [OpenAPI document](../../packages/api-client/openapi.json). This does not imply that every API operation has a corresponding web control.
- The [worker entry point](../../apps/worker/src/index.ts) composes automation, content-publishing and media-orphan ticks from built API modules into one loop implemented in [the worker-loop script](../../scripts/automation-worker-loop.mjs). Its bounded JSON tick events are local logging, **not** a deployed metrics or alerting service.
- The [Prisma schema](../../apps/api/prisma/schema.prisma) and [database module](../../apps/api/src/database/database.module.ts) define the PostgreSQL persistence boundary. The [health controller](../../apps/api/src/features/health/health.controller.ts) has a liveness route and a time-boxed readiness route that calls a [read-only Prisma `SELECT 1` probe](../../apps/api/src/features/health/readiness-probe.port.ts). This code path is not evidence of a successful probe against a real database in this Phase 7 run.

## Authorization boundary

[Organization policy](../../apps/api/src/features/organizations/domain/organization-access.ts) defines OWNER, MANAGER, BROKER, CLIENT and a distinct PLATFORM_ADMIN role; organization permissions require an active membership. [The finance report controller](../../apps/api/src/features/finance/http/report.controller.ts) is an example of feature-specific authorization. Neither a role definition nor this controller proves end-to-end tenant isolation. That requires the remaining [EF-701 security review and PostgreSQL integration evidence](../TASKS.md).

## What still needs evidence

This is **one documentation slice** of EF-704. The [Phase 7 plan](../DEVELOPMENT_PLAN.md) also calls for a case study, security/testing and finance walkthroughs, a demo script, and synthetic-data screenshots/video. Before any Pilot or sellable-product claim, the [task register](../TASKS.md) still requires independent security/privacy acceptance, operational drills and monitoring, reviewed onboarding/import, a named decision owner, and real Pilot evidence. No customer data, production deployment, or Pilot is authorized by this document.
