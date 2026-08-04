# Role Report — EF-120-II-C-D1

## Status
PASS

## Goal
Repair Nest guard dependency injection so class-based guard enhancers receive their configured dependencies, with an automated no-DB regression test.

## Allowed paths used
- `apps/api/src/features/auth/auth.module.ts`
- `apps/api/src/features/auth/http/origin.guard.ts`
- `apps/api/src/features/auth/http/browser-session.guard.ts`
- `apps/api/src/features/auth/http/csrf.guard.ts`
- `apps/api/src/features/auth/http/refresh-csrf.guard.ts`
- `apps/api/src/features/auth/http/auth-cookie.service.ts`
- `apps/api/test/auth.http.test.mjs`
- `docs/handoffs/EF-120-II-C-D1/worker-report.md`

## Files changed
- `apps/api/src/features/auth/auth.module.ts` — replaced guard factory providers with direct class providers.
- `apps/api/src/features/auth/http/origin.guard.ts` — made the guard injectable and injected `AUTH_RUNTIME_CONFIG`; its canonical origin is read from runtime config while preserving narrow direct string construction.
- `apps/api/src/features/auth/http/browser-session.guard.ts` — made the guard injectable and injected `AuthenticateAccess`.
- `apps/api/src/features/auth/http/csrf.guard.ts` — made the guard injectable and injected `SESSION_CREDENTIAL_ISSUER`.
- `apps/api/src/features/auth/http/refresh-csrf.guard.ts` — marked the guard injectable.
- `apps/api/src/features/auth/http/auth-cookie.service.ts` — marked the service injectable.
- `apps/api/test/auth.http.test.mjs` — added EF-120 application-context regression coverage with explicit test authentication environment.
- `docs/handoffs/EF-120-II-C-D1/worker-report.md` — this report.

## Root cause and repair
The custom guard `useFactory` providers configured only their registered instances. Nest also materialized guard classes referenced by controller `@UseGuards`, leaving those enhancer instances without constructor dependencies. Direct class providers plus constructor token injection ensure every Nest-created guard instance is configured.

## Commands run
1. `pnpm --dir apps/api run build && node --test apps/api/test/auth.http.test.mjs` before the production repair.
2. `pnpm --dir apps/api run build && node --test apps/api/test/auth.http.test.mjs` after the repair.
3. `pnpm --dir apps/api run build && node --test apps/api/test/auth.http-primitives.test.mjs apps/api/test/auth.http.test.mjs` after preserving narrow direct origin-guard construction.
4. `pnpm --dir apps/api run test`
5. `node --test apps/api/dist/bootstrap/config.test.js`
6. `pnpm --dir apps/api run typecheck`
7. `pnpm lint`
8. `pnpm --dir apps/api run build`
9. `git diff --check`

## Observed output
- RED: the EF-120 application-context test failed against the pre-repair build with `ForbiddenException: Forbidden` when every resolved origin guard was asked to accept the configured exact unsafe origin; exit 1.
- GREEN targeted guard test: 11 tests passed, 0 failed; exit 0.
- Narrow guard regression: 23 tests passed, 0 failed; exit 0.
- `pnpm --dir apps/api run test`: 53 tests passed, 0 failed; exit 0.
- `node --test apps/api/dist/bootstrap/config.test.js`: 2 tests passed, 0 failed; exit 0.
- `pnpm --dir apps/api run typecheck`: local Prisma client generation completed, then TypeScript completed; exit 0.
- `pnpm lint`: ESLint completed with zero warnings, workspace boundary check passed, and infrastructure contract check passed; exit 0.
- `pnpm --dir apps/api run build`: TypeScript completed; exit 0.
- `git diff --check`: exit 0 with no output.

## Verification
The regression instantiates a Nest application context with explicit test auth configuration and verifies that every resolved origin guard accepts the configured exact unsafe origin, every browser-session guard receives the application `AuthenticateAccess` instance, and every CSRF guard receives the configured credential issuer. The full packet verification command set passed fresh after the repair.

## Execution lifecycle
completed

## Touched paths observed
Only the packet-listed source, test, and handoff paths above were edited in this phase. No database connection, migration, query, integration-test, infrastructure, environment-file, dependency-manifest, staging, commit, push, or deployment command was run. The packet-mandated typecheck invoked local Prisma client generation only; it did not connect to or operate a database.

## Session/resume reference
unavailable

## Risks
None observed within the authorized scope. Guard ordering, exact Origin checks, existing error mapping, and narrow direct guard construction remain covered by tests.

## Documentation impact observed
Required: this corrects auth runtime composition. Route the result through documentation-governance to determine whether existing technical-context or architecture documentation requires an approved update. No documentation surface beyond this mandatory handoff was changed in this packet.

## Git/publication posture observed
No staging, commit, push, tag, deployment, or publication was performed. A Luna Git Audit and the required human gates remain necessary before any publication.

## Recommended next human decision
Authorize independent verification/review and documentation-governance routing if required; this executor report does not authorize further work or publication.

clean-code-guard: clean
test-guard: clean
docs-guard: clean
