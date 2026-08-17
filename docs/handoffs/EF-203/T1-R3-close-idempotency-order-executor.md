# Role Report — EF-203-T1-R3-CLOSE-IDEMPOTENCY-ORDER

## Status
PARTIAL

## Goal
Repair close command idempotency ordering so replay preflight runs before Lead/version checks and preserves the original close outcome after version advancement.

## Allowed paths used
- `apps/api/src/features/leads/application/lead-repository.ts`
- `apps/api/src/features/leads/application/lead-application.ts`
- `apps/api/test/ef203-deal.application.test.mjs`
- `docs/handoffs/EF-203/T1-R3-close-idempotency-order-executor.md`

## Files changed
- Added mandatory typed `preflightClose` port and explicit close preflight/result types.
- Orchestrated authorization, key validation, preflight, then Lead read/version validation.
- Replaced the replay fake with post-close Lead version advancement and typed same-key payload conflict proof.

## Commands run
```text
node --test apps/api/test/ef203-deal.application.test.mjs
cd apps/api && pnpm exec tsc --project tsconfig.json --noEmit
node --test apps/api/test/ef203-deal.domain.test.mjs apps/api/test/ef203-deal.application.test.mjs apps/api/test/ef202-lead.domain.test.mjs apps/api/test/ef202-lead.application.test.mjs
 git diff --check
```

## Observed output
- Initial RED replay simulation: 5 failures; replay returned `stale-version-conflict` and no preflight call existed.
- Focused final regression: `29` tests, `29` pass, `0` fail.
- `git diff --check`: exit `0`.
- TypeScript build/typecheck: fails on pre-existing/out-of-scope Prisma repository and generated-schema errors, including the newly mandatory unimplemented T2 repository ports. No build workaround was used.

## Verification
The real simulation records the first close result, advances current Lead to `CLOSED_WON` version `4`, and verifies the second identical command returns exact original deal/event objects without Lead read, ID generation, or mutation. Different normalized payload with the same key returns typed `idempotency-conflict` at preflight. Authorization, invalid-key, ownership, stale-version, EF-203 domain, and EF-202 regressions pass.

## Execution lifecycle
completed

## Touched paths observed
Packet-allowed changed paths only, plus this report. Pre-existing unrelated worktree changes were present at start and were not modified.

## Session/resume reference
None.

## Risks
T2 remains required to implement the Prisma/repository preflight and close ports with atomic canonical payload hash comparison and the second atomic idempotency check. Build/typecheck is intentionally not claimed as passing.

## Documentation impact observed
Required: the application/repository contract changed; this executor report records the change. No README, schema, HTTP, or architecture files were modified.

## Git/publication posture observed
No commit, push, deploy, install, migration, or publication performed.

## Recommended next human decision
Route the separately approved T2 persistence implementation and verification; do not treat this executor result as a build pass or release approval.
