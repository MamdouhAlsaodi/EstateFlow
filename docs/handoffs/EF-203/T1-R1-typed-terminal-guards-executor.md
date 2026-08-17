# Role Report — EF-203-T1-R1-TYPED-TERMINAL-GUARDS

## Status
PARTIAL

## Goal
Repair the stale EF-202 stage expectation, make deal-close ports mandatory on `LeadRepository`, dispatch close commands directly, and reject assignment/next-action mutations on terminal Leads.

## Allowed paths used
- `apps/api/src/features/leads/domain/lead.ts`
- `apps/api/src/features/leads/application/lead-repository.ts`
- `apps/api/src/features/leads/application/lead-application.ts`
- `apps/api/test/ef202-lead.domain.test.mjs`
- `docs/handoffs/EF-203/T1-R1-typed-terminal-guards-executor.md`

No forbidden path was edited by this execution.

## Files changed
- Added `requireActiveLead` guards after version validation in `assignLead` and `setLeadNextAction`.
- Removed `LeadDealCloseRepository`, capability probing, and close-repository dispatch; added mandatory `closeWon`/`closeLost` methods directly to `LeadRepository`; application calls them directly.
- Updated only the stale exact-four-stage EF-202 assertion and added terminal mutation regression coverage.

## Commands run
1. RED: `node --test apps/api/test/ef202-lead.domain.test.mjs`
2. Build probe: `npm --prefix apps/api run build`
3. Required focused verification: `node --test apps/api/test/ef203-deal.domain.test.mjs apps/api/test/ef203-deal.application.test.mjs apps/api/test/ef202-lead.domain.test.mjs apps/api/test/ef202-lead.application.test.mjs`
4. Required hygiene verification: `git diff --check`
5. Source grep for dynamic close-port capability/index dispatch.

## Observed output
- RED failed as expected: terminal assignment/next-action regression had missing expected exceptions.
- Build exited `2` with the expected existing Prisma/schema mismatch, including missing `closeWon`/`closeLost` on the pre-existing Prisma adapter and stale Prisma enum/event types. No build mismatch was hidden or treated as pass.
- Final focused tests: `27` passed, `0` failed.
- `git diff --check`: exit `0`, no output.
- Close-flow grep found no `LeadDealCloseRepository`, `hasDealClosePorts`, `closeRepository`, optional close ports, or repository-index dispatch in the permitted domain/application source.

## Verification
Focused domain/application verification and diff hygiene PASS. Overall packet status remains PARTIAL because the API build exits non-zero against the pre-existing Prisma schema/adapter mismatch. This is explicitly reserved for T2 and was not bypassed.

## Execution lifecycle
completed

## Touched paths observed
- `apps/api/src/features/leads/domain/lead.ts`
- `apps/api/src/features/leads/application/lead-repository.ts`
- `apps/api/src/features/leads/application/lead-application.ts`
- `apps/api/test/ef202-lead.domain.test.mjs`
- `docs/handoffs/EF-203/T1-R1-typed-terminal-guards-executor.md`

The other dirty worktree paths were pre-existing approved EF-202 baseline or unrelated and were not edited.

## Session/resume reference
None.

## Risks
- T2 persistence must reject all active child commands for terminal Leads atomically within the close transaction; no repository read or generic mutation was invented here.
- The Prisma adapter and generated schema/types remain out of scope and must be repaired by T2.

## Documentation impact observed
Required for CTO routing: repository contract and terminal domain behavior changed. This executor report is the only documentation artifact created.

## Git/publication posture observed
No commit, push, deploy, package installation, credential, or publication action performed.

## Recommended next human decision
Review the PARTIAL evidence and route the separately approved T2 persistence packet for the Prisma/schema mismatch and atomic terminal child-command enforcement.
