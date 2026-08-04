# Role Report — EF-120-III-C1

## Status
BLOCKED

## Goal
Compose EF-120-III recovery/reset and abuse controls at the Nest HTTP/composition boundary, with mandatory dependencies and test-only delivery.

## Allowed paths used
- `apps/api/test/auth.http-primitives.test.mjs`
- `apps/api/test/bootstrap.test.mjs`
- `docs/handoffs/EF-120-III-C1/worker-report.md`

## Files changed
- `apps/api/test/auth.http-primitives.test.mjs` — added RED coverage for direct-socket-only request context hashing.
- `apps/api/test/bootstrap.test.mjs` — added RED coverage for test-only fake-delivery configuration gating.
- `docs/handoffs/EF-120-III-C1/worker-report.md` — this report.

## Commands run
```text
pnpm --dir apps/api run build && node --test apps/api/test/auth.http-primitives.test.mjs apps/api/test/bootstrap.test.mjs
```

## Observed output
- TypeScript build completed with exit status 0.
- The direct-socket context test failed as expected because the required compiled `auth-request-context.factory` module does not exist.
- The fake-delivery configuration test failed as expected because `authFakeDelivery` is absent from the runtime configuration and evaluates as `undefined` rather than `false`.
- Command exit status: 1; 16 tests passed and 2 tests failed.

## Verification
The packet's full verification commands were not run because the required RED tests intentionally fail and the phase is blocked before implementation. No database command, schema action, infrastructure action, dependency action, Git action, or source-evaluation proof was run.

## Execution lifecycle
completed

## Touched paths observed
- `apps/api/test/auth.http-primitives.test.mjs`
- `apps/api/test/bootstrap.test.mjs`
- `docs/handoffs/EF-120-III-C1/worker-report.md`

## Session/resume reference
Unavailable.

## Risks
The packet requires removing `AuthAbuseConfigurationError`, which is defined in `apps/api/src/features/auth/domain/auth-errors.ts`. That path is not in `scope.allowed_paths`; the global policy permits source edits only inside explicit allowed paths. Leaving the class violates the packet requirement, while removing it violates the packet scope. Implementation cannot safely continue under this conflict.

## Documentation impact observed
required if the runtime configuration and HTTP contract implementation proceeds under a corrected packet.

## Git/publication posture observed
No Git/publication action was taken. A Luna Git Audit would be required before any future commit, subject to a separately authorized packet and human gate.

## Recommended next human decision
Issue a fresh approved delta packet that explicitly adds `apps/api/src/features/auth/domain/auth-errors.ts` to the allowed paths (or explicitly revises the requirement to retain that class). It must also state whether the two currently added RED tests should remain as the starting point.
