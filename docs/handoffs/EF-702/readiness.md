# EF-702 — Readiness slice: real `GET /health/ready` PostgreSQL probe (implementation)

Packet: bounded EF-702 first readiness/reliability slice · branch `feat/ef702-readiness` (from verified `origin/main` `525c53032794bc124eec6790fb7e8991fbf5f21c`) · date 2026-10-03

## What was built

`GET /health/ready` no longer succeeds by default on an operator-set environment flag. It now verifies PostgreSQL reachability through the existing global `PrismaService` singleton with a cheap read-only `SELECT 1`, under a strict 1-second timeout and single-flight admission control. `GET /health/live` is untouched and remains DB-independent.

### 1. Port + production adapter (`apps/api/src/features/health/readiness-probe.port.ts`, new)

- `ReadinessProbePort` — narrow port: `check(): Promise<void>`; resolves = reachable, rejects = not reachable. Keeps health decisions free of driver details so tests inject a fake.
- `PrismaReadinessProbe` — the only production adapter: one `prisma.$queryRaw\`SELECT 1\`` through the shared singleton. No writes, no schema assumptions, no connection churn. Follows the EF-305 port+adapter-in-one-file convention (`notification-provider.port.ts` precedent).

### 2. Controller (`apps/api/src/features/health/health.controller.ts`)

- `ready()` returns 200 `{status:"ok"}` **only** when the probe succeeds. Any rejection, timeout, or synchronously-throwing probe fails closed with the same generic 503 (`ServiceUnavailableException("Dependencies are not ready")`), identical to the pre-existing manual-override 503 body. No DB URL, SQL, error text, stack, or hostnames can reach the response: the probe verdict is collapsed to a boolean before `ready()` ever sees it.
- `ESTATEFLOW_READY=false` manual override preserved exactly (forces generic 503 without calling the probe). The default path is no longer "succeed unless flagged" — that default-success behavior was the defect.
- Strict time box: `READINESS_TIMEOUT_MS = 1_000` (module constant, deliberately not an env knob — the validated-config surface in `bootstrap/config.ts` was not extended).
- Single-flight admission: at most **one** outstanding probe at any time. While a probe is outstanding, all concurrent callers share its verdict; a never-settling query therefore cannot spawn unbounded concurrent probes (callers reuse the shared verdict, each still answered within its own 1s box). The slot releases as soon as the underlying probe settles, so recovery is re-probed on the next request. Timers are always cleared.
- Prisma caveat, documented deliberately: Prisma 6 has no client-side cancellation for raw queries, so a timed-out probe's SQL may still complete server-side; admission control (max 1 outstanding) is the sanctioned conservative bound per the readiness analysis. Realistic driver failure modes (connection errors, pool timeouts) settle the probe and release the slot.

### 3. Module (`apps/api/src/features/health/health.module.ts`)

Provides `PrismaReadinessProbe`; `PrismaService` resolves via the existing `@Global()` `DatabaseModule`. No other wiring changed.

### 4. Contract / OpenAPI — unchanged (verified)

Operation IDs (`getLiveHealth`/`getReadyHealth`), 200 schema (`{status:"ok"}`), 503 description ("Dependencies are not ready"), and the error filter body (`{error:{code:"HTTP_ERROR",message,requestId}}`) are all byte-identical in behavior. `packages/api-client/openapi.json` and `src/generated.ts` untouched; `pnpm check:openapi-drift` PASS (exit 0).

### Redis

Not probed, on evidence: no Redis/BullMQ connection exists in the checked-in API or worker runtime (worker composes API contexts over Prisma only). Revisit only if Redis becomes a concrete runtime dependency.

## Tests (fake-probe, TDD; no database, no Docker, no network)

New `apps/api/test/health.test.mjs` (8 tests):

1. probe succeeds → `ready()` resolves `{status:"ok"}`;
2. probe rejects → generic 503 (`ServiceUnavailableException`, status 503, generic message, fake's `postgres://secret-host` detail asserted absent from the response shape);
3. synchronously-throwing probe → same generic 503 (no 500 escape);
4. never-settling probe → 3 concurrent `ready()` calls all reject within the strict ~1s box and the probe was invoked **exactly once** (single-flight + bounded answer);
5. slot release on settle: after a hung probe settles, the next `ready()` runs a fresh probe and succeeds (recovery re-probed);
6. `live()` stays synchronous, returns ok, and invokes no probe — including while readiness is failing;
7. `ESTATEFLOW_READY=false` → generic 503 with **zero** probe invocations;
8. composition: `NestFactory.create(AppModule)` wires the real `PrismaReadinessProbe` instance into the controller (same instance as `app.get(PrismaReadinessProbe)`), live ok, override rejects — proving production wiring without a database (mirrors the pre-existing `openapi.test.mjs` app-composition pattern).

`apps/api/test/bootstrap.test.mjs`: the outdated `ESTATEFLOW_READY` toggle test (which codified default-success) was replaced by a liveness-independence test using a rejecting fake probe. All other bootstrap coverage untouched.

## Merge gate

The EF-702 PR **must not merge** until the EF-701 security gate is accepted; this packet claims no exception to the EF-701 dependency.

## Gates (all fresh, this session)

| Gate                                                                                      | Result                                               |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm --dir apps/api test` (build + full unit suite)                                      | PASS — 66 files (65 pre-existing + new health suite) |
| Focused: `node --test test/health.test.mjs test/bootstrap.test.mjs test/openapi.test.mjs` | PASS — 14/14                                         |
| `pnpm --dir apps/api run typecheck` (prisma generate + `tsc --noEmit`)                    | PASS (exit 0)                                        |
| `pnpm --dir apps/api run lint` (`eslint src --max-warnings=0`)                            | PASS (exit 0)                                        |
| `pnpm check:openapi-drift`                                                                | PASS (exit 0; artifacts unchanged)                   |
| `prettier --check` touched source/test files                                              | PASS                                                 |

Environment honesty: the sandbox shipped Node v22 without pnpm and without `node_modules`; the repo requires Node ≥24.14.1 (`argon2` in `node:crypto` is Node 24+). Locally installed Node v24.14.1 (matches `.nvmrc`), enabled corepack pnpm 10.33.2, `pnpm install --frozen-lockfile`, and `prisma generate` (codegen only) to make the repo's own checks runnable. Unit-only checks; `pnpm test:integration`, Docker, and any DB contact were deliberately not run (out of scope for fake-probe coverage).

## Correction pass (2026-10-03, post-review)

- Root `pnpm lint` previously failed at `apps/api/test/health.test.mjs:108:34` (`setImmediate` is not defined, no-undef); fixed to `globalThis.setImmediate`. The composed-AppModule test now restores every `process.env` key it changes (including the removed `DATABASE_URL`) in `finally`, preventing cross-test pollution; it performs no real DB query.
- Parent-observed focused check on Node v24.14.1 (`node --test test/health.test.mjs test/bootstrap.test.mjs test/openapi.test.mjs` from `apps/api`): **PASS 14/14**.
- Broader gates (root `pnpm lint`, typecheck, full suite, drift) remain pending in this worktree — Node v22 with no pnpm here; only the focused set above was re-run in this pass.
- `docs/DEVELOPMENT_PLAN.md` was read directly and confirmed present; the earlier reviewer claim that it is absent is incorrect.
- **Dependency gate (explicit): the EF-702 PR must not merge until the EF-701 security gate is accepted. No exception to the EF-701 dependency is claimed.** EF-701 has partial unmerged PRs #20/#21 (in progress, not complete); the EF-702 readiness slice is PREPARED for review only.

## Limits / not claimed

- Readiness here means **API↔PostgreSQL connectivity**, nothing more. It does not verify migrations are current, storage writability, worker health, Redis (non-dependency), backup/restore, metrics/alerts, or runbooks. Those remain open EF-702 scope; this slice does not certify full operational readiness or Phase 7 completion.
- Phase 7 numbering conflict resolved per Mamdouh's explicit authorization: `docs/DEVELOPMENT_PLAN.md` Phase 7 is canonical; the outdated rows in `docs/TASKS.md` were reconciled with a dated rationale note (EF-701 security audit, EF-702 reliability/operations, EF-703 pilot onboarding, EF-704 portfolio release, EF-705 sellable-product gate with the explicit deployment approval). No phase claimed complete.
- The ops runbook's canonical root (`/home/server/projects/estateflow`) does not match this isolated clone; its live-operations steps were not followed or validated here.
- No commit/push/PR, no `.env`/secret reads, no customer data, no migrations, no worker changes, no new dependencies, no deployment.

## Changed paths

- `apps/api/src/features/health/health.controller.ts` (probe injection, strict 1s single-flight readiness, generic 503)
- `apps/api/src/features/health/health.module.ts` (provide `PrismaReadinessProbe`)
- `apps/api/src/features/health/readiness-probe.port.ts` (new — port + Prisma adapter)
- `apps/api/test/health.test.mjs` (new — 8 fake-probe tests)
- `apps/api/test/bootstrap.test.mjs` (health test modernized; other tests untouched)
- `docs/TASKS.md` (Phase 7 rows reconciliation only)
- `docs/handoffs/EF-702/readiness.md` (new — this packet)
- Generated OpenAPI/client artifacts: **intentionally unchanged** (contract unchanged, drift check PASS)
