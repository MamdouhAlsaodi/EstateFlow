# Role Report — EF-121-AUTH-A

## Status
BLOCKED

## Goal
Add the minimum persisted `platformRole` authority attribute to `SessionPrincipal` and `request.auth` using RED then GREEN tests.

## Allowed paths used
- `apps/api/test/auth.application.test.mjs`
- `docs/handoffs/EF-121-AUTH-A/worker-report.md`

## Files changed
- `apps/api/test/auth.application.test.mjs` — added a RED assertion that `AuthenticateAccess` maps persisted `NONE` and `PLATFORM_ADMIN` values into the principal.
- `docs/handoffs/EF-121-AUTH-A/worker-report.md` — this report.

## Commands run
```text
pnpm --dir apps/api run build && node --test apps/api/test/auth.application.test.mjs
pnpm --dir apps/api run db:generate
```

## Observed output
- The pre-change build completed successfully.
- The focused RED run completed with 9 passing tests and 1 expected failing test. The failure was an assertion that the returned principal lacked `platformRole: "NONE"`.
- Prisma client generation completed successfully; no database, migration, Docker, environment, or schema operation was run.

## Verification
RED evidence:
```text
Expected values to be strictly deep-equal:
- platformRole: 'NONE'
```

GREEN verification was not run because the authorized production-path set cannot produce a type-safe required `SessionPrincipal.platformRole`.

## Execution lifecycle
completed

## Touched paths observed
- `apps/api/test/auth.application.test.mjs`
- `docs/handoffs/EF-121-AUTH-A/worker-report.md`

## Session/resume reference
None.

## Risks
`apps/api/src/features/auth/application/login.ts` constructs a value explicitly typed as `SessionPrincipal`, but it is forbidden by this packet. Making `SessionPrincipal.platformRole` required (necessary for safe authorization and the packet contract) makes that existing construction fail TypeScript compilation unless `login.ts` is updated to load and map the persisted role. Making the property optional would violate the requirement that authorization receive an exact persisted `NONE` or `PLATFORM_ADMIN` value.

## Documentation impact observed
required — the authenticated-principal authority contract changes.

## Git/publication posture observed
No commit, push, deployment, package configuration change, or staging was performed. A Luna Git Audit is required before any later publication.

## Recommended next human decision
Issue a narrow approved delta packet that adds `apps/api/src/features/auth/application/login.ts` to the allowed paths (and, if required by its persistence input, explicitly confirms the corresponding allowed repository mapping), then complete the minimal GREEN implementation and named verification commands.
