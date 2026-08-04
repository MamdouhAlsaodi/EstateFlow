# EF-202 T1 Executor Handoff

## Status

PASS

## EF-202 T1 quality correction evidence

- Application validates every idempotency key as a trimmed, non-empty string of at most 255 characters before repository mutation; invalid keys return the typed `invalid-idempotency-key` result.
- `LeadRepository.createLead` and `updateLead` now explicitly require atomic command-keyed replay: an accepted command replays its original result without duplicate Lead/timeline persistence, while a different command using the key returns typed `idempotency-conflict`. Persistence remains unimplemented.
- `LEAD_CREATED` event, event data, and timeline collection are frozen at runtime; mutation timeline collections are frozen as well.
- Focused tests cover create success, unverified actor denial, invalid/empty/oversized keys without repository calls, fake repository replay identity without duplicate timeline intent, and `Object.isFrozen` assertions.

## Scope completed

- Added the Lead domain contract under `apps/api/src/features/leads/domain/`.
- Added the application/repository contracts under `apps/api/src/features/leads/application/`.
- Added focused domain and application tests under `apps/api/test/`.
- No Prisma, infrastructure, presentation, module wiring, HTTP, UI, dependency, database, commit, push, or deployment changes.

## Contract evidence

- Stages are exactly `NEW`, `CONTACTED`, `QUALIFIED`, and `NURTURING`.
- Only the six approved transitions are accepted; invalid stages and transitions raise typed domain errors.
- Lead creation requires organization ownership, owner assignment, next action, source, UTM context, and starts at optimistic version `1`.
- Assignment, stage, and next-action changes each create explicit immutable timeline event intents.
- Repository/application contracts carry idempotency keys and typed `stale-version-conflict`, `ownership-conflict`, `ok`, and `idempotent-replay` results.
- Timeline persistence is append-only by repository contract; no update/delete timeline operation is exposed.

## RED → GREEN evidence

- RED: focused tests initially failed because the Lead compiled modules did not exist (`ERR_MODULE_NOT_FOUND`).
- GREEN: after the minimum domain/application implementation, the focused suite passed 8/8.

## Verification evidence

- `source ~/.nvm/nvm.sh && nvm use 24.14.1 && cd /home/server/projects/estateflow && pnpm --dir apps/api run build` — exit 0.
- `source ~/.nvm/nvm.sh && nvm use 24.14.1 && pnpm --dir apps/api run build` — exit 0.
- `node --test apps/api/test/ef202-lead.domain.test.mjs apps/api/test/ef202-lead.application.test.mjs` — literal result: `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.
- `git diff --check` — exit 0.

## Changed paths

- `apps/api/src/features/leads/application/lead-application.ts`
- `apps/api/src/features/leads/application/lead-repository.ts`
- `apps/api/test/ef202-lead.application.test.mjs`
- `docs/handoffs/EF-202/T1-executor.md`

## Risks and next human decision

- The repository contract documents atomicity and typed conflicts but intentionally has no persistence implementation; the persistence owner must enforce the invariant transactionally.
- Next human decision: approve the corrected T1 contract evidence before any separately authorized persistence or presentation work.

## Next gate

Persistence, presentation, module wiring, and subsequent EF-202 slices remain outside this packet.
